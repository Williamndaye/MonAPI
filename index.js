const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args)); // Pour éviter "fetch is not a function"

const app = express();
const port = 3000;

const serviceAccount = require('./serviceAccountKey.json');

// Initialiser Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://taximotoapp-abe3d.firebaseio.com" // ← si tu veux utiliser aussi Realtime DB
});

// Initialiser Firestore après admin
const firestore = admin.firestore();

app.use(cors());
app.use(express.json());


  // === Route CONNEXION ===
  app.post('/connexion', async (req, res) => {
    const { email, motdepasse } = req.body;

    if (!email || !motdepasse) {
      return res.status(400).json({ message: 'Email et mot de passe requis.' });
    }

    try {
      const response = await fetch(
        'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyDZ4eYOquW0Sr8_2g0Se7f5DLlqGNh7ebo',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            password: motdepasse,
            returnSecureToken: true
          })
        }
      );

      const data = await response.json();

      if (data.error) {
        return res.status(401).json({ message: 'Identifiants invalides.', erreur: data.error.message });
      }

      const uid = data.localId;
      const doc = await firestore.collection('utilisateurs').doc(uid).get();

      if (!doc.exists) {
        return res.status(404).json({ message: 'Utilisateur introuvable dans Firestore.' });
      }

      const infos = doc.data();

      res.status(200).json({
        message: 'Connexion réussie.',
        uid: uid,
        nom: infos.nom,
        type_utilisateur: infos.type_utilisateur,
        email: infos.email
      });

    } catch (error) {
      res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
  });
  
// ROUTE POUR L'INSCRIPTION

app.post('/inscription', async (req, res) => {
  const { email, motdepasse, nom, type_utilisateur } = req.body;

  // Vérification des champs
  if (!email || !motdepasse || !nom || !type_utilisateur) {
    return res.status(400).send({ message: 'Tous les champs sont requis' });
  }

  try {
    // Création dans Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email: email,
      password: motdepasse,
      displayName: nom
    });

    const uid = userRecord.uid;

    // Enregistrement dans Firestore
    //const firestore = admin.firestore();
    await firestore.collection('utilisateurs').doc(uid).set({
      uid: uid,
      nom: nom,
      email: email,
      type_utilisateur: type_utilisateur
    });

    // Réponse de succès
    res.status(200).send({
      message: 'Utilisateur inscrit avec succès',
      uid: uid,
      nom: nom,
      type_utilisateur: type_utilisateur
    });

  } catch (error) {
    res.status(400).send({
      message: 'Erreur lors de l\'inscription',
      error: error.message
    });
  }
});

// Route POST pour effectuer une réservation
app.post('/reserver-course', async (req, res) => {
  const { uidClient, depart, arrivee, prixEstime } = req.body;

  // Vérification des champs
  if (!uidClient || !depart || !arrivee || !prixEstime) {
    return res.status(400).json({ error: 'Champs requis manquants.' });
  }

  try {
    // Création du document dans la collection "reservations"
    const reservationRef = await firestore.collection('reservations').add({
      uidClient,
      depart,
      arrivee,
      prixEstime,
      statut: 'en_attente', // statut initial
      creeLe: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({
      message: 'Réservation enregistrée avec succès.',
      reservationId: reservationRef.id
    });

  } catch (error) {
    console.error('Erreur lors de la réservation :', error);
    res.status(500).json({ error: 'Erreur serveur lors de l’enregistrement.' });
  }
});

// === ROUTE POUR OBTENIR TOUS LES CHAUFFEURS INSCRITS ===
app.get('/chauffeurs', async (req, res) => {
  try {
    const snapshot = await firestore.collection('utilisateurs')
      .where('type_utilisateur', '==', 'chauffeur')
      .get();

    const chauffeurs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    res.status(200).json({
      message: 'Liste des chauffeurs récupérée avec succès.',
      chauffeurs: chauffeurs
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des chauffeurs :', error);
    res.status(500).json({ error: 'Erreur serveur lors de la récupération des chauffeurs.' });
  }
});
// route pour afficher les utilisateurs
app.get('/utilisateurs', async (req, res) => {
  try {
    const snapshot = await firestore.collection('utilisateurs').get();

    const utilisateurs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json({
      message: 'Liste de tous les utilisateurs',
      utilisateurs: utilisateurs
    });
  } catch (error) {
    console.error('Erreur récupération utilisateurs:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la récupération.' });
  }
});
// ROUTE POUR AFFICHER TOUS LES CLIENTS
app.get('/clients', async (req, res) => {
  try {
    const snapshot = await firestore
      .collection('utilisateurs')
      .where('type_utilisateur', '==', 'client')
      .get();

    const clients = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json({
      message: 'Liste des clients récupérée avec succès.',
      clients: clients
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des clients:', error);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.listen(port, () => {
  console.log(`Serveur backend lancé sur le port ${port}`);
});