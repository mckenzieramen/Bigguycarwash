/* Big Guy's Carwash Firebase Web App configuration. */
window.BIGGUYS_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAvTo4ieD6x1RK5WrFgGq7STjEQjHbh7dE",
  authDomain: "big-guys-carwash.firebaseapp.com",
  projectId: "big-guys-carwash",
  storageBucket: "big-guys-carwash.firebasestorage.app",
  messagingSenderId: "267146668906",
  appId: "1:267146668906:web:ad94aec90fa44d7299313"
};

/* Employee DTR guided Help tutorial. Kept separate so existing DTR logic remains unchanged. */
(function () {
  if (typeof document === 'undefined') return;
  var script = document.createElement('script');
  script.src = 'dtr-help.js';
  script.defer = true;
  document.head.appendChild(script);
})();