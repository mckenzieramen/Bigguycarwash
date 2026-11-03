/* Big Guy's Carwash Firebase Web App configuration. */
window.BIGGUYS_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAvTo4ieD6x1RK5WrFgGq7STjEQjHbh7dE",
  authDomain: "big-guys-carwash.firebaseapp.com",
  projectId: "big-guys-carwash",
  storageBucket: "big-guys-carwash.firebasestorage.app",
  messagingSenderId: "267146668906",
  appId: "1:267146668906:web:ad94aec90fa44d7299313"
};

/* Employee/customer DTR guided Help tutorial.
   This tutorial belongs only to the DTR/customer attendance page and must never load in Admin. */
(function () {
  if (typeof document === 'undefined') return;
  function loadDtrHelp() {
    if (document.body && document.body.classList.contains('admin-body')) return;
    if (document.querySelector('script[data-bigguys-dtr-help]')) return;
    var script = document.createElement('script');
    script.src = 'dtr-help.js?v=20261103-customer-only-v1';
    script.defer = true;
    script.setAttribute('data-bigguys-dtr-help', 'true');
    document.head.appendChild(script);
  }
  if (document.body) loadDtrHelp();
  else document.addEventListener('DOMContentLoaded', loadDtrHelp, { once: true });
})();

/* Admin Dashboard guided tutorial + locked schedule draft guard. */
(function () {
  if (typeof document === 'undefined') return;
  function loadAdminTour() {
    if (!document.body || !document.body.classList.contains('admin-body')) return;
    if (document.querySelector('script[data-bigguys-admin-tour]')) return;
    if (!document.querySelector('script[data-bigguys-schedule-guard]')) {
      var guard = document.createElement('script');
      guard.src = 'schedule-draft-guard.js?v=20261103-persist-v1';
      guard.defer = true;
      guard.setAttribute('data-bigguys-schedule-guard', 'true');
      document.head.appendChild(guard);
    }
    var script = document.createElement('script');
    script.src = 'admin-guided-tour.js?v=20261103-tabs-v3';
    script.defer = true;
    script.setAttribute('data-bigguys-admin-tour', 'true');
    document.head.appendChild(script);
  }
  if (document.body) loadAdminTour();
  else document.addEventListener('DOMContentLoaded', loadAdminTour, { once: true });
})();

/* Mobile payroll horizontal scrolling and reload-safe Firebase admin session. */
(function () {
  if (typeof document === 'undefined') return;
  function loadAdminMobileSessionFix() {
    if (!document.body || !document.body.classList.contains('admin-body')) return;
    if (document.querySelector('script[data-bigguys-admin-mobile-session]')) return;
    var script = document.createElement('script');
    script.src = 'admin-mobile-session-fix.js?v=20261103-v2';
    script.defer = true;
    script.setAttribute('data-bigguys-admin-mobile-session', 'true');
    document.head.appendChild(script);
  }
  if (document.body) loadAdminMobileSessionFix();
  else document.addEventListener('DOMContentLoaded', loadAdminMobileSessionFix, { once: true });
})();
