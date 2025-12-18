import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

// ================== FIREBASE CONFIG ==================
const firebaseConfig = {
  apiKey: "AIzaSyC3Mu5W0Aol7DvtQ28mdtnD1qWt426ea9U",
  authDomain: "undes-27404.firebaseapp.com",
  projectId: "undes-27404",
  storageBucket: "undes-27404.firebasestorage.app",
  messagingSenderId: "392425028546",
  appId: "1:392425028546:web:6f24b527752361db68b45b",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ================== BACKEND BASE URL ==================
// ⚠️ ЭНД өөрийн Render URL-ээ хий
const RENDER_BASE = "https://YOUR-RENDER-SERVICE.onrender.com";

const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : RENDER_BASE;

// ================== HELPERS ==================
async function getToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken(true);
}

async function apiFetch(path, options = {}) {
  const token = await getToken();

  const headers = {
    ...(options.headers || {}),
    "Content-Type": "application/json",
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

// ================== HEADER BUTTONS ==================
const welcomeText = document.getElementById("welcome-text");
const btnMyTree = document.getElementById("btn-my-tree");
const btnLogin = document.getElementById("btn-open-auth");
const btnLogout = document.getElementById("btn-logout");

// ================== AUTH MODAL ==================
const modal = document.getElementById("auth-modal");
const back = document.getElementById("auth-backdrop");
const closeBtn = document.getElementById("auth-close");

function openModal() {
  modal.hidden = false;
  back.hidden = false;

  setTimeout(() => {
    modal.classList.add("show");
    back.classList.add("show");
  }, 10);
}

function closeModal() {
  modal.classList.remove("show");
  back.classList.remove("show");

  setTimeout(() => {
    modal.hidden = true;
    back.hidden = true;
  }, 250);
}

btnLogin?.addEventListener("click", openModal);
closeBtn?.addEventListener("click", closeModal);
back?.addEventListener("click", closeModal);

// ================== TABS ==================
const formSignin = document.getElementById("form-signin");
const formSignup = document.getElementById("form-signup");
const tabBtns = document.querySelectorAll(".tab-btn");

tabBtns.forEach((t) =>
  t.addEventListener("click", () => {
    tabBtns.forEach((x) => x.classList.remove("active"));
    t.classList.add("active");

    if (t.dataset.tab === "signin") {
      formSignin.classList.remove("hidden");
      formSignup.classList.add("hidden");
    } else {
      formSignup.classList.remove("hidden");
      formSignin.classList.add("hidden");
    }
  })
);

// ======================= TOAST =======================
const toastBox = document.getElementById("toast-box");
const toastText = document.getElementById("toast-text");
const toastBackdrop = document.getElementById("toast-backdrop");

function showToast(msg) {
  toastText.textContent = msg;

  toastBox.hidden = false;
  toastBackdrop.hidden = false;

  setTimeout(() => {
    toastBox.classList.add("show");
    toastBackdrop.classList.add("show");
  }, 10);

  setTimeout(() => {
    toastBox.classList.remove("show");
    toastBackdrop.classList.remove("show");

    setTimeout(() => {
      toastBox.hidden = true;
      toastBackdrop.hidden = true;
    }, 250);
  }, 2000);
}

// ======================= SIGNUP =======================
formSignup?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("up-name").value.trim();
  const email = document.getElementById("up-email").value.trim();
  const pass = document.getElementById("up-pass").value.trim();

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });

    // no auto-login
    await signOut(auth);

    closeModal();
    document.querySelector('[data-tab="signin"]').click();
    showToast("Амжилттай бүртгэгдлээ! Одоо нэвтэрнэ үү.");
  } catch (err) {
    showToast(err.message);
  }
});

// ======================= SIGNIN =======================
formSignin?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("in-email").value.trim();
  const pass = document.getElementById("in-pass").value.trim();

  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);

    // ✅ token авч localStorage-д хадгал
    const token = await getIdToken(cred.user, true);
    localStorage.setItem("undes_token", token);

    // 🔥 BACKEND-д Firebase token баталгаажуулна
    await syncSessionToBackend(cred.user);

    if (token) localStorage.setItem("undes_token", token);

    // backend test (optional, гэхдээ алдаа илрүүлэхэд хэрэгтэй)
    const res = await apiFetch("/api/auth/me", { method: "GET" });
    const out = await res.json();
    if (!res.ok || !out.ok) throw new Error(out.error || "Backend auth failed");

    closeModal();
    showToast("Тавтай морилно уу!");
  } catch (err) {
    showToast(err.message);
  }
});

// ======================= LOGOUT POPUP =======================
const logoutModal = document.getElementById("logout-modal");
const logoutBackdrop = document.getElementById("logout-backdrop");
const logoutCancel = document.getElementById("logout-cancel");
const logoutConfirm = document.getElementById("logout-confirm");

btnLogout?.addEventListener("click", () => {
  logoutModal.hidden = false;
  logoutBackdrop.hidden = false;

  setTimeout(() => {
    logoutModal.classList.add("show");
    logoutBackdrop.classList.add("show");
  }, 10);
});

function closeLogoutPopup() {
  logoutModal.classList.remove("show");
  logoutBackdrop.classList.remove("show");

  setTimeout(() => {
    logoutModal.hidden = true;
    logoutBackdrop.hidden = true;
  }, 250);
}

logoutCancel?.addEventListener("click", closeLogoutPopup);
logoutBackdrop?.addEventListener("click", closeLogoutPopup);

logoutConfirm?.addEventListener("click", async () => {
  await signOut(auth);
  localStorage.removeItem("firebase_uid");
  localStorage.removeItem("undes_token"); // ✅ нэм
  closeLogoutPopup();
  showToast("Амжилттай гарлаа");
});


// ======================= AUTH STATE =======================
onAuthStateChanged(auth, async (user) => {
  try {
    if (user) {
      const name = user.displayName || (user.email ? user.email.split("@")[0] : "user");

      welcomeText.textContent = `Тавтай морилно уу, ${name}`;
      welcomeText.hidden = false;

      btnMyTree.hidden = false;
      btnLogout.hidden = false;
      btnLogin.hidden = true;

      // ✅ token-оо заавал refresh(true) хийж хадгал
      const token = await user.getIdToken(true);
      localStorage.setItem("undes_token", token);

      // ✅ (Optional) preload tree — зөвхөн амжилттай бол cache-д хийнэ
      try {
        const r = await apiFetch("/api/tree/load", { method: "GET" });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok && j.data) {
          localStorage.setItem("undes_tree", JSON.stringify(j.data));
        }
      } catch (e) {
        console.warn("Tree prefetch failed:", e);
      }

    } else {
      welcomeText.textContent = "";
      welcomeText.hidden = true;

      btnMyTree.hidden = true;
      btnLogout.hidden = true;
      btnLogin.hidden = false;

      // ✅ logout үед цэвэрлэ
      localStorage.removeItem("undes_token");
      localStorage.removeItem("undes_tree");
      localStorage.removeItem("firebase_uid");
    }
  } catch (e) {
    console.error("onAuthStateChanged error:", e);
    // хамгаалалт: ямар нэг юм эвдэрвэл UI-г login төлөвт буцаана
    btnMyTree.hidden = true;
    btnLogout.hidden = true;
    btnLogin.hidden = false;
  }
});

async function submitPersonForm() {
  const nameInput = document.getElementById("person-name");
  const ageInput = document.getElementById("person-age");
  const sexSelect = document.getElementById("person-sex");
  const photoInput = document.getElementById("person-photo");

  const data = {
    name: nameInput.value.trim(),
    age: ageInput.value.trim(),
    sex: sexSelect.value.trim(),
    photoUrl: photoInput ? photoInput.value.trim() : "",
  };

  switch (modalMode) {
    case "edit":
      if (modalTarget) editPersonWithData(modalTarget, data);
      break;
    case "add-father":
      if (modalTarget) addFatherWithData(modalTarget, data);
      break;
    case "add-mother":
      if (modalTarget) addMotherWithData(modalTarget, data);
      break;
    case "add-spouse":
      if (modalTarget) addSpouseWithData(modalTarget, data);
      break;
    case "add-child":
      if (modalTarget) addChildWithData(modalTarget, data);
      break;
  }

  // ✅ заавал await
  await saveTreeToJson();

  closePersonModal();
  layoutTree();
  renderTree();
}


// ======================= ROUTING =======================
function requireLogin() {
  openModal();

  // force signin tab
  formSignin.classList.remove("hidden");
  formSignup.classList.add("hidden");

  tabBtns.forEach((x) => x.classList.remove("active"));
  tabBtns[0].classList.add("active");
}

function goToFamilyTree() {
  window.location.href = "family-tree.html";
}

document.querySelectorAll(".go-tree").forEach((btn) => {
  btn.addEventListener("click", () => {
    const user = auth.currentUser;
    if (!user) return requireLogin();
    goToFamilyTree();
  });
});
