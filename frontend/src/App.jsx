import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AttendantView from './AttendantView';
import ClientView from './ClientView';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"       element={<AttendantView />} />
        <Route path="/client" element={<ClientView />} />
      </Routes>
    </BrowserRouter>
  );
}
