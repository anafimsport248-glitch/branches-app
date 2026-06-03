const firebaseConfig = {
  apiKey: "AIzaSyBv5lt1NiqX94eN5SnWwNeqKFCCDFLDHJM",
  authDomain: "anafim-platform.firebaseapp.com",
  projectId: "anafim-platform",
  storageBucket: "anafim-platform.firebasestorage.app",
  messagingSenderId: "635194966567",
  appId: "1:635194966567:web:6f416069d69a1002f50402",
  measurementId: "G-CX297B1TBW"
};

firebase.initializeApp(firebaseConfig);
const auth    = firebase.auth();
const db      = firebase.firestore();
const storage = firebase.storage();
