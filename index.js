const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Initialisation Firebase Admin
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://taximotoapp-abe3d-default-rtdb.firebaseio.com"
});

const firestore = admin.firestore();
const realtimeDB = admin.database();

// Route test
app.get("/", (req, res) => {
  res.send("Bienvenue dans l'API TaxiMoto !");
});

// 🚀 Exemple : Ajouter un utilisateur
app.post("/inscription", async (req, res) => {
  const { uid, nom, email, type } = req.body;

  try {
    await firestore.collection("utilisateurs").doc(uid).set({ nom, email, type });
    res.status(200).send({ message: "Utilisateur enregistré !" });
  } catch (err) {
    console.error("Erreur Firestore :", err);
    res.status(500).send({ error: "Erreur lors de l'inscription." });
  }
});

// Démarrage serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Serveur Express démarré sur le port " + PORT);
});

