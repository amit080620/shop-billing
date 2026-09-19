"use client";

// Login, signup and the public pages had no error boundary below the root,
// so a crash there skipped the app's recovery (log + auto-reload) and showed
// Next's bare "Application error" screen. Same handling as the dashboard.
export { default } from "./(dashboard)/error";
