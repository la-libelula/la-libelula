import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Configuración del proyecto de Registro de Viajeros (La Libélula Autocheckin)
const firebaseConfig = {
    apiKey: "AIzaSyCCcIGkF_z4DMV9aM2WbLYUOUo4SgNTsMc",
    authDomain: "cheking-rural.firebaseapp.com",
    projectId: "cheking-rural",
    storageBucket: "cheking-rural.firebasestorage.app",
    messagingSenderId: "749939272506",
    appId: "1:749939272506:web:df79c6035926cf3981be03"
};

const app = initializeApp(firebaseConfig);
const db_viajeros = getFirestore(app);

export { db_viajeros };
