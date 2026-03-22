const firebaseConfig = {
    apiKey: "AIzaSyD1IMLr1RlSSDS-9jyYUmazXb1sDXyzFG0",
    authDomain: "intlk-12138.firebaseapp.com",
    projectId: "intlk-12138",
    storageBucket: "intlk-12138.firebasestorage.app",
    messagingSenderId: "920999336288",
    appId: "1:920999336288:web:71686a4f5639563f532605"
};

let auth, db;
try {
    if (firebaseConfig.apiKey !== "你的_API_KEY") {
        firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
    } else {
        console.warn("Firebase not configured. Cloud sync unavailable.");
    }
} catch (e) { console.error("Firebase Init Error", e); }
