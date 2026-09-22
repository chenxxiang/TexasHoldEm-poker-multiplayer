import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import GameRoom from './pages/GameRoom';
import { AppearanceProvider } from './context/AppearanceContext';

export default function App() {
  return (
    <AppearanceProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/room/:roomId" element={<GameRoom />} />
        </Routes>
      </BrowserRouter>
    </AppearanceProvider>
  );
}
