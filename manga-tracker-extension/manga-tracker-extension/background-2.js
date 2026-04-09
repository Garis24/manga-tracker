const AUTH_TIMEOUT_MS = 8000;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('auth_timeout'));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function openGoogleLoginTabFallback() {
  const url = 'https://accounts.google.com/';
  await chrome.tabs.create({ url });
}

async function getDriveTokenInteractiveSafe() {
  try {
    return await withTimeout(getDriveTokenInteractive(), AUTH_TIMEOUT_MS);
  } catch (err) {
    await openGoogleLoginTabFallback();
    throw new Error('FALLBACK_TAB_OPENED');
  }
}