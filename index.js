const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const app = express();
const port = 3000;

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL:"https://taximotoapp-abe3d-default-rtdb.firebaseio.com/" // Remplace par ton URL Realtime Database
});

app.use(cors());
app.use(express.json());
// route pour l'inscription
app.post('/inscription', async (req, res) => {
  const { email, motdepasse, nom, type_utilisateur } = req.body;

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password: motdepasse,
      displayName: nom,
    });

    await admin.database().ref(`utilisateurs/${userRecord.uid}`).set({
      nom,
      email,
      type_utilisateur
    });

    res.status(200).send({ message: 'Utilisateur inscrit avec succès', uid: userRecord.uid });
  } catch (error) {
    res.status(400).send({ message: 'Erreur lors de l\'inscription', error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Serveur backend lancé sur le port ${port}`);
});