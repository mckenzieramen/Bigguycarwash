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

/* Admin Dashboard guided tutorial. Additive loader only; existing admin/Firebase features remain unchanged. */
(function () {
  if (typeof document === 'undefined' || !document.body || !document.body.classList.contains('admin-body')) return;
  if (document.querySelector('script[data-bigguys-admin-tour]')) return;
  var script = document.createElement('script');
  script.src = 'admin-guided-tour.js?v=20261102-v1';
  script.defer = true;
  script.setAttribute('data-bigguys-admin-tour', 'true');
  document.head.appendChild(script);
})();