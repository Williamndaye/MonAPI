const signupController = async (req, res) => {
  const admin = req.admin;
  const { email, password, nom, type } = req.body;

  if (!email || !password || !nom || !type) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }

  try {
    // Création utilisateur dans Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password,
    });

    // Enregistrement des infos dans Firestore (sans mot de passe)
    await admin.firestore().collection('utilisateurs').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email,
      nom,
      type,
    });

    res.status(201).json({
      message: 'Utilisateur créé avec succès !',
      uid: userRecord.uid,
    });
  } catch (error) {
    console.error('Erreur création utilisateur:', error);
    res.status(400).json({ error: error.message });
  }
};

module.exports = { signupController };