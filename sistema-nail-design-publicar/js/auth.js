import { auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const btnEntrar = document.getElementById("btnEntrar");
const mensagemErro = document.getElementById("mensagemErro");

onAuthStateChanged(auth, (user) => {
  if (user && window.location.pathname.includes("login.html")) {
    window.location.href = "index.html";
  }
});

btnEntrar.addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value.trim();

  if (!email || !senha) {
    mensagemErro.textContent = "Informe e-mail e senha.";
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, senha);
    window.location.href = "index.html";
  } catch (error) {
    mensagemErro.textContent = "E-mail ou senha inválidos.";
    console.error(error);
  }
});