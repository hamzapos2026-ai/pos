import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "dummy",
  projectId: "aone-jewelry-pos",
  // we just need projectId for the emulator or we can check the actual src/services/firebase.js
};
