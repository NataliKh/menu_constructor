import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import MenuConstructorPage from "./pages/constructor";
import "./App.css";
import { ToastContainer } from "./shared/ui/ToastContainer";

const App: React.FC = () => {
  return (
    <ToastContainer>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MenuConstructorPage />} />
        </Routes>
      </BrowserRouter>
    </ToastContainer>
  );
};

export default App;
