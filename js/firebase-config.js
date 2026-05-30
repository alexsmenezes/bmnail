import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyACrqzwl6x3hnSRwFNioKzHEIlNquCkstw",
  authDomain: "sistema-nail-design.firebaseapp.com",
  projectId: "sistema-nail-design",
  storageBucket: "sistema-nail-design.firebasestorage.app",
  messagingSenderId: "327180614202",
  appId: "1:327180614202:web:074e1f1c2fb7d377ca9303"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);