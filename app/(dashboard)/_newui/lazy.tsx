"use client";

import dynamic from "next/dynamic";

// The New look's client parts (lib/uiVersion) in chunks of their own, fetched only by a page that
// shows them — Classic pages, which never render these, don't download their code. Still drawn on
// the server, so the page arrives complete.
export const NewUiRoot = dynamic(() => import("@/app/components/NewUiRoot").then((m) => m.NewUiRoot));
export const NewDesktopSidebar = dynamic(() => import("./NewDesktopSidebar").then((m) => m.NewDesktopSidebar));
export const NewBottomNav = dynamic(() => import("./NewBottomNav").then((m) => m.NewBottomNav));
export const NewPrimaryAction = dynamic(() => import("./NewPrimaryAction").then((m) => m.NewPrimaryAction));
