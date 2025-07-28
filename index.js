const axios = require('axios');
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const fetch = require('node-fetch');// ligne ajoutée 


const app = express();
app.use(cors());
app.use(express.json());

// Initialisation Firebase Admin
const serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS); //ligne code ajouté

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://taximotoapp-abe3d-default-rtdb.firebaseio.com"
});

const firestore = admin.firestore();
const realtimeDB = admin.database();

// Route test
app.get("/test", (req, res) => {
  res.json({ message: "Serveur Node.js opérationnel"  });
});
// ROUTE POUR L'INSCRIPTION
app.post("/inscription", async (req, res) => {
  const { email, password, nom, type } = req.body;

  if (!email || !password || !nom || !type) {
    return res.status(400).send({ message: "Tous les champs sont obligatoires" });
  }

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password
    });

    const uid = userRecord.uid;

    await firestore.collection("utilisateurs").doc(uid).set({
      nom,
      email,
      type,
      online: false
    });

    res.status(200).send({
      message: "Utilisateur inscrit avec succès",
      uid: uid
    });

  } catch (err) {
    console.error("Erreur lors de l'inscription :", err);

    let errorMessage = "Échec de l'inscription";

    if (err.code === 'auth/email-already-exists') {
      errorMessage = "Cet email est déjà utilisé";
      return res.status(400).send({ message: errorMessage });
    }

    res.status(500).send({
      message: errorMessage,
      erreur: err.message
    });
  }
});

//ROUTE POUR LA CONNEXION
// Route connexion
app.post("/connexion", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Authentification via Firebase Auth REST API
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyDZ4eYOquW0Sr8_2g0Se7f5DLlqGNh7ebo`,
      {
        email,
        password,
        returnSecureToken: true
      }
    );

    const idToken = response.data.idToken;
    const uid = response.data.localId;

    // Récupérer les infos de Firestore avec le UID
    const doc = await firestore.collection("utilisateurs").doc(uid).get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Utilisateur non trouvé dans Firestore" });
    }

    const userData = doc.data();

    res.status(200).send({
      message: "Connexion réussie",
      idToken,
      uid,
      email,
      nom: userData.nom,
      type: userData.type
    });

  } catch (error) {
    console.error("Erreur de connexion :", error.response?.data || error.message);
    res.status(401).send({
      message: "Échec de la connexion",
      erreur: error.response?.data?.error?.message || error.message
    });
  }
});

//========afficher les chauffeurs en ligne======
app.get("/chauffeurs-en-ligne", async (req, res) => {
  try {
    const snapshot = await firestore.collection("utilisateurs")
      .where("type", "==", "chauffeur")
      .where("online", "==", true)
      .get();

    const chauffeursEnLigne = [];
    snapshot.forEach(doc => {
      chauffeursEnLigne.push({ uid: doc.id, ...doc.data() });
    });

    res.status(200).send({ chauffeurs: chauffeursEnLigne });
  } catch (err) {
    console.error("Erreur lors de la récupération des chauffeurs en ligne :", err);
    res.status(500).send({ error: "Erreur serveur lors de la récupération." });
  }
});
// ACTIVER ET DESACTIVER LA PRESENCE EN LIGNE
app.post("/presence", async (req, res) => {
  const { uid, online } = req.body;

  if (!uid || online === undefined) {
    return res.status(400).send({ error: "UID ou statut 'online' manquant." });
  }

  try {
    // Mettre à jour la présence dans Firestore
    await firestore.collection("utilisateurs").doc(uid).update({
      online: online
    });

    res.status(200).send({
      message: `Présence ${online ? "activée (en ligne)" : "désactivée (hors ligne)"}`,
      uid: uid,
      online: online
    });

  } catch (err) {
    console.error("Erreur mise à jour présence :", err);
    res.status(500).send({ error: "Erreur lors de la mise à jour de la présence." });
  }
});

//ROUTE POUR ENVOYER ET SUPPRIMER LA POSITION DU CHAUFFEUR 
app.post("/position", async (req, res) => {
  const { uid, latitude, longitude } = req.body;

  if (!uid) {
    return res.status(400).send({ error: "UID manquant." });
  }

  try {
    if (latitude !== undefined && longitude !== undefined) {
      // Enregistrer la position
      await realtimeDB.ref(`positions_chauffeurs/${uid}`).set({
        latitude,
        longitude,
        timestamp: new Date().toISOString()
      });

      res.status(200).send({
        message: "Position enregistrée avec succès",
        uid: uid,
        latitude,
        longitude
      });

    } else {
      // Supprimer la position (pas de lat/lng envoyé)
      await realtimeDB.ref(`positions_chauffeurs/${uid}`).remove();

      res.status(200).send({
        message: "Position supprimée avec succès",
        uid: uid
      });
    }

  } catch (err) {
    console.error("Erreur position :", err);
    res.status(500).send({ error: "Erreur lors du traitement de la position." });
  }
});

//// ROUTE RECUPERER LA POSITION D'UN CHAUFFERU VIA SON UID
app.get("/position-chauffeur/:uid", async (req, res) => {
  const uid = req.params.uid;

  try {
    const snapshot = await realtimeDB.ref(`positions_chauffeurs/${uid}`).once("value");

    if (!snapshot.exists()) {
      return res.status(404).send({ error: "Position non trouvée pour ce chauffeur." });
    }

    const position = snapshot.val();

    res.status(200).send({
      uid: uid,
      latitude: position.latitude,
      longitude: position.longitude
    });

  } catch (err) {
    console.error("Erreur lors de la récupération de la position :", err);
    res.status(500).send({ error: "Erreur serveur lors de la récupération de la position." });
  }
});

//  ROUTE ENVOYER LA RESERVATION AUX CHAUFFEURS ON LINE
app.post("/reserver", async (req, res) => {
  const { client_uid, chauffeur_uid, depart, arrivee, prix } = req.body;

  try {
    // 1. Vérifier que le chauffeur est en ligne dans Firestore
    const chauffeurDoc = await firestore.collection("utilisateurs").doc(chauffeur_uid).get();
    
    if (!chauffeurDoc.exists) {
      return res.status(404).send({ message: "Chauffeur non trouvé." });
    }

    const chauffeurData = chauffeurDoc.data();
    if (chauffeurData.online !== true) {
      return res.status(400).send({ message: "Ce chauffeur n'est pas en ligne." });
    }

    // 2. Créer une réservation dans Realtime Database
    const ref = realtimeDB.ref("reservations/" + chauffeur_uid);

    const nouvelleReservation = {
      client_uid,
      depart,
      arrivee,
      prix,
      statut: "en_attente",
      timestamp: Date.now()
    };

    const nouvelleRef = await ref.push(nouvelleReservation);

    res.status(200).send({
      message: "Réservation envoyée au chauffeur.",
      reservation_id: nouvelleRef.key
    });

  } catch (err) {
    console.error("Erreur lors de la réservation :", err);
    res.status(500).send({ message: "Erreur serveur", erreur: err.message });
  }
});
// ROUTE POUR ACCEPTER UNE RESERVATION 
app.post("/reservation/accepter", async (req, res) => {
  const { chauffeur_uid, reservation_id } = req.body;

  try {
    await admin
      .database()
      .ref(`reservations/${chauffeur_uid}/${reservation_id}/statut`)
      .set("acceptee");

    res.status(200).send({ message: "Réservation acceptée." });
  } catch (err) {
    console.error("Erreur :", err);
    res.status(500).send({ message: "Erreur lors de l'acceptation de la réservation." });
  }
});

// ROUTE POUR REFUSER UNE RESERVATION 
// Refuser une réservation
app.post("/reservation/refuser", async (req, res) => {
  const { chauffeur_uid, reservation_id } = req.body;

  if (!chauffeur_uid || !reservation_id) {
    return res.status(400).send({ error: "chauffeur_uid et reservation_id requis." });
  }

  try {
    await realtimeDB
      .ref(`reservations/${chauffeur_uid}/${reservation_id}/statut`)
      .set("refusee");

    res.status(200).send({ message: "Réservation refusée." });
  } catch (error) {
    console.error("Erreur lors du refus de la réservation :", error);
    res.status(500).send({ error: "Erreur serveur lors du refus de la réservation." });
  }
});
//ROUTE POUR AFFICHER TOUTES LES reservations
app.get("/reservations/:chauffeur_uid", async (req, res) => {
  const chauffeur_uid = req.params.chauffeur_uid;

  try {
    const ref = realtimeDB.ref(`reservations/${chauffeur_uid}`);
    const snapshot = await ref.once("value");

    if (!snapshot.exists()) {
      return res.status(200).json({ reservations: [] });
    }

    const allReservations = snapshot.val();
    const filtered = [];

    for (const id in allReservations) {
      const resData = allReservations[id];

      // Filtrer uniquement les réservations en attente ou autre critère
      if (resData.statut === "en_attente") {
        filtered.push({
          id,
          ...resData
        });
      }
    }

    res.status(200).json({ reservations: filtered });

  } catch (error) {
    console.error("Erreur lors de la récupération des réservations :", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
//ROUTE POUR AFFICHER LES RESERVATIONS COTE client
app.get("/reservation/client/:uid", async (req, res) => {
  const clientUID = req.params.uid;

  try {
    const snapshot = await firestore.collection("reservations")
      .where("client_uid", "==", clientUID)
      .get();

    if (snapshot.empty) {
      return res.status(200).json([]); // Aucune réservation trouvée
    }

    const reservations = [];
    snapshot.forEach(doc => {
      reservations.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json(reservations);
  } catch (error) {
    console.error("Erreur lors de la récupération des réservations client :", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Démarrage serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Serveur Express démarré sur le port " + PORT);
});