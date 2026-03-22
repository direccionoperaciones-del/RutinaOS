export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    const register = () => {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('✅ ServiceWorker registrado con scope:', registration.scope);
          
          // Forzar update si es necesario
          if (registration.waiting) {
            console.log('ServiceWorker esperando activación...');
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        })
        .catch(registrationError => {
          console.error('❌ ServiceWorker falló:', registrationError);
        });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register);
    }
  } else {
    console.warn('⚠️ ServiceWorker no soportado en este navegador');
  }
}