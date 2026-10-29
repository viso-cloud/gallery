/*
  STATIC SITE CONFIGURATION
  1. Create a Google Cloud API key and enable Google Drive API.
  2. Paste the key and Drive folder ID below.
  3. Restrict the API key to Google Drive API and your GitHub Pages referrer.
  NOTE: A static website cannot keep API keys secret. This setup requires the
  Drive folder/files to be accessible to anyone with the link (Viewer).
*/
window.MARWA_CONFIG = {
  GOOGLE_API_KEY: "AIzaSyDn0HXY-1UDFugbuWLv446zq5HXJrliJZo",
  DRIVE_FOLDER_ID: "1bM4TT_zrVtszPeSdLZqatYPuJ8tntX6H",
  SYNC_INTERVAL_MS: 45000
};
