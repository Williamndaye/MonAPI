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
//ROUTE INSCRIPTION
// ROUTE POUR L'INSCRIPTION
app.post("/inscription", async (req, res) => {
  const { email, password, nom, type } = req.body;

  if (!email || !password || !nom || !type) {
    return res.status(400).send({ message: "Tous les champs sont obligatoires" });
  }

  try {
    // Créer l'utilisateur dans Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password
    });

    const uid = userRecord.uid;

    // Enregistrer dans Firestore avec le champ UID également
    await firestore.collection("utilisateurs").doc(uid).set({
      uid: uid,              // Ajout explicite du champ uid
      nom: nom,
      email: email,
      type: type,
      online: false
    });

    res.status(200).send({
      message: "Bravo votre inscription a reussi",
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
      message: "Connexion reussie",
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
      message: `Presence ${online ? "activee (en ligne)" : "desactivee (hors ligne)"}`,
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
      return res.status(404).send({ error: "Position non trouvee pour ce chauffeur." });
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
    // 1. Vérifier que le chauffeur existe et est en ligne
    const chauffeurDoc = await firestore.collection("utilisateurs").doc(chauffeur_uid).get();
    if (!chauffeurDoc.exists) {
      return res.status(404).send({ message: "Chauffeur non trouve." });
    }

    const chauffeurData = chauffeurDoc.data();
    if (chauffeurData.online !== true) {
      return res.status(400).send({ message: "Ce chauffeur n'est pas en ligne." });
    }

    // 2. Vérifier les anciennes réservations du client dans Realtime Database
    const reservationsRef = realtimeDB.ref("reservations");
    const snapshot = await reservationsRef.once("value");

    let reservationExistante = null;

    snapshot.forEach(chauffeurSnapshot => {
      chauffeurSnapshot.forEach(reservation => {
        const data = reservation.val();
        if (data.client_uid === client_uid && data.statut !== "refusee") {
          reservationExistante = data.statut;
        }
      });
    });

    // 3. Si une réservation existe déjà pour ce client
    if (reservationExistante === "en_attente") {
      return res.status(400).send({ message: "Vous avez une reservation en attente." });
    }

    if (reservationExistante === "acceptee") {
      return res.status(400).send({ message: "Vous avez une reservation en cours. Attendez votre chauffeur." });
    }

    // 4. Créer une nouvelle réservation
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
      message: "Reservation envoyee au chauffeur.",
      reservation_id: nouvelleRef.key
    });

  } catch (err) {
    console.error("Erreur lors de la reservation :", err);
    res.status(500).send({ message: "Erreur serveur", erreur: err.message });
  }
});
// ROUTE POUR ACCEPTER UNE RESERVATION 
app.post("/reservation/accepter", async (req, res) => {
  const { chauffeur_uid, reservation_id } = req.body;

  if (!chauffeur_uid || !reservation_id) {
    return res.status(400).send({ message: "chauffeur_uid et reservation_id requis." });
  }

  try {
    const chauffeurRef = realtimeDB.ref(`reservations/${chauffeur_uid}`);
    const snapshot = await chauffeurRef.once("value");

    if (!snapshot.exists()) {
      return res.status(404).send({ message: "Aucune réservation trouvée pour ce chauffeur." });
    }

    // Vérifier si une réservation est déjà acceptée
    let dejaAcceptee = false;
    snapshot.forEach(child => {
      const reservation = child.val();
      if (reservation.statut === "acceptee") {
        dejaAcceptee = true;
      }
    });

    if (dejaAcceptee) {
      return res.status(400).send({ message: "Vous avez déjà une réservation acceptée en cours." });
    }

    // Vérifier que la réservation spécifique existe
    const resRef = realtimeDB.ref(`reservations/${chauffeur_uid}/${reservation_id}`);
    const resSnapshot = await resRef.once("value");

    if (!resSnapshot.exists()) {
      return res.status(404).send({ message: "Réservation introuvable." });
    }

    // Mettre à jour le statut
    await resRef.child("statut").set("acceptee");

    res.status(200).send({ message: "Réservation acceptée." });

  } catch (err) {
    console.error("Erreur :", err);
    res.status(500).send({ message: "Erreur lors de l'acceptation de la réservation." });
  }
});

// ROUTE POUR REFUSER UNE RESERVATION 

app.post("/reservation/refuser", async (req, res) => {
  const { chauffeur_uid, reservation_id } = req.body;

  if (!chauffeur_uid || !reservation_id) {
    return res.status(400).send({ message: "chauffeur_uid et reservation_id requis." });
  }

  try {
    const reservationRef = realtimeDB.ref(`reservations/${chauffeur_uid}/${reservation_id}`);
    const snapshot = await reservationRef.once("value");

    if (!snapshot.exists()) {
      return res.status(404).send({ message: "Réservation introuvable." });
    }

    const reservation = snapshot.val();

    if (reservation.statut === "acceptee") {
      return res.status(400).send({ message: "Impossible de refuser : la réservation a déjà été acceptée." });
    }

    if (reservation.statut === "refusee") {
      return res.status(400).send({ message: "Réservation déjà refusée." });
    }

    if (reservation.statut !== "en_attente") {
      return res.status(400).send({ message: "Cette réservation n’est pas dans un état valide pour être refusée." });
    }

    // Mise à jour du statut
    await reservationRef.child("statut").set("refusee");

    res.status(200).send({ message: "Réservation refusée avec succès." });

  } catch (error) {
    console.error("Erreur lors du refus de la réservation :", error);
    res.status(500).send({ message: "Erreur serveur lors du refus de la réservation." });
  }
});
// ROUTE POUR TERMINER LA reservation
app.post("/reservation/terminer", async (req, res) => {
  const { chauffeur_uid, reservation_id } = req.body;

  if (!chauffeur_uid || !reservation_id) {
    return res.status(400).send({ message: "chauffeur_uid et reservation_id requis." });
  }

  try {
    const reservationRef = realtimeDB.ref(`reservations/${chauffeur_uid}/${reservation_id}`);
    const snapshot = await reservationRef.once("value");

    if (!snapshot.exists()) {
      return res.status(404).send({ message: "Réservation introuvable." });
    }

    const reservation = snapshot.val();

    if (reservation.statut === "en_attente") {
      return res.status(400).send({ message: "Impossible de terminer une réservation en attente." });
    }

    if (reservation.statut === "refusee") {
      return res.status(400).send({ message: "Cette réservation a été refusée." });
    }

    if (reservation.statut === "terminee") {
      return res.status(400).send({ message: "Cette réservation est déjà terminée." });
    }

    if (reservation.statut !== "acceptee") {
      return res.status(400).send({ message: "Réservation dans un état non valide pour être terminée." });
    }

    await reservationRef.child("statut").set("terminee");

    res.status(200).send({ message: "Réservation marquée comme terminée." });

  } catch (error) {
    console.error("Erreur lors de la mise à jour :", error);
    res.status(500).send({ message: "Erreur serveur lors de la terminaison de la réservation." });
  }
});

// ROUTE POUR AFFICHER LES RESERVATIOS DU CHAUFFEUR 
app.get("/reservations/:chauffeur_uid", async (req, res) => {
  const chauffeur_uid = req.params.chauffeur_uid;

  try {
    const ref = realtimeDB.ref(`reservations/${chauffeur_uid}`);
    const snapshot = await ref.once("value");

    if (!snapshot.exists()) {
      return res.status(200).json({ reservations: [] });
    }

    const allReservations = snapshot.val();
    const reservationsArray = [];

    for (const id in allReservations) {
      const resData = allReservations[id];
      // Aucune condition ici, on prend tout
      reservationsArray.push({
        id,
        ...resData
      });
    }

    res.status(200).json({ reservations: reservationsArray });

  } catch (error) {
    console.error("Erreur lors de la récupération des réservations :", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

//ROUTE POUR AFFICHER LES RESERVATIONS COTE client
app.get("/reservations-client/:client_uid", async (req, res) => {
  const client_uid = req.params.client_uid;

  try {
    const ref = realtimeDB.ref("reservations");
    const snapshot = await ref.once("value");

    if (!snapshot.exists()) {
      return res.status(200).json({ reservations: [] });
    }

    const data = snapshot.val();
    const results = [];

    // Parcours des réservations par chauffeur
    for (const chauffeurUID in data) {
      const reservationsParChauffeur = data[chauffeurUID];

      for (const reservationID in reservationsParChauffeur) {
        const reservation = reservationsParChauffeur[reservationID];

        if (reservation.client_uid === client_uid) {
          results.push({
            id: reservationID,
            chauffeur_uid: chauffeurUID,
            ...reservation
          });
        }
      }
    }

    res.status(200).json({ reservations: results });

  } catch (error) {
    console.error("Erreur lors de la récupération des réservations client :", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Démarrage serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Serveur Express démarré sur le port " + PORT);
});