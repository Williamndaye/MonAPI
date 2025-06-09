const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// Fonction lanceé à la création d'un utilisateur Firebase Auth
exports.addUserToFirestore = functions.auth.user().onCreate(async (user) => {
  const {uid, email, displayName} = user;

  try {
    await admin.firestore().collection("users").doc(uid).set({
      email: email || "",
      name: displayName || "",
      type: "client", // Modifier selon besoin
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Utilisateur ${uid} ajouté dans Firestore.`);
  } catch (error) {
    console.error("Erreur lors de l’ajout utilisateur:", error);
  }
});
