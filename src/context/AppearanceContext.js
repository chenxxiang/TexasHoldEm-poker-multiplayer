import { createContext, useContext, useState, useCallback } from 'react';
import { DEFAULT_DECK, getDeck } from '../data/decks';
import { DEFAULT_BG, getBackground } from '../data/backgrounds';

// Which card skin and table background this browser is using. Purely local: nothing here is
// sent to the server or to the other players, so everyone at a table can look at a different
// room with a different deck in their hands. Card.jsx reads the deck straight off this
// context, which keeps the skin out of the props of every component that renders a card.

const STORAGE = { deck: 'poker_deck', bg: 'poker_bg' };

function read(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;   // private mode, blocked storage — the defaults still work
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* preference just will not survive a reload */
  }
}

const AppearanceContext = createContext({
  deck: getDeck(DEFAULT_DECK),
  background: getBackground(DEFAULT_BG),
  setDeckId: () => {},
  setBgId: () => {},
});

export function AppearanceProvider({ children }) {
  const [deckId, setDeckIdState] = useState(() => read(STORAGE.deck, DEFAULT_DECK));
  const [bgId, setBgIdState] = useState(() => read(STORAGE.bg, DEFAULT_BG));

  const setDeckId = useCallback((id) => {
    setDeckIdState(id);
    write(STORAGE.deck, id);
  }, []);

  const setBgId = useCallback((id) => {
    setBgIdState(id);
    write(STORAGE.bg, id);
  }, []);

  // resolve through the registries so a stale or removed id falls back to the default
  const value = {
    deck: getDeck(deckId),
    background: getBackground(bgId),
    setDeckId,
    setBgId,
  };

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  return useContext(AppearanceContext);
}
