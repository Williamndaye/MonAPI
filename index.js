const fetch = require('node-fetch');
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const app = express();
const port = 3000;

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

app.use(cors());
app.use(express.json());

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
    const firestore = admin.firestore();
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

// Route de connexion
app.post('/connexion', async (req, res) => {
  const { email, motdepasse } = req.body;

  if (!email || !motdepasse) {
    return res.status(400).send({ message: 'Email et mot de passe sont requis' });
  }

  try {
    const apiKey = "AIzaSyDZ4eYOquW0Sr8_2g0Se7f5DLlqGNh7ebo"; // 🔐 Remplace si besoin
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email,
        password: motdepasse,
        returnSecureToken: true
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(401).send({
        message: 'Échec de connexion',
        error: data.error.message
      });
    }

    const uid = data.localId;

    const firestore = admin.firestore();
    const doc = await firestore.collection('utilisateurs').doc(uid).get();

    if (!doc.exists) {
      return res.status(404).send({ message: 'Utilisateur non trouvé dans Firestore' });
    }

    const userData = doc.data();

    res.status(200).send({
      message: 'Connexion réussie',
      uid: uid,
      nom: userData.nom,
      email: userData.email,
      type_utilisateur: userData.type_utilisateur
    });

  } catch (error) {
    res.status(500).send({
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// route pour afficher tous les chauffeurs


app.listen(port, () => {
  console.log(`Serveur backend lancé sur le port ${port}`);
});