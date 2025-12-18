import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

/* ================== FIREBASE ================== */
const firebaseConfig = {
  apiKey: "AIzaSyC3Mu5W0Aol7DvtQ28mdtnD1qWt426ea9U",
  authDomain: "undes-27404.firebaseapp.com",
  projectId: "undes-27404",
  storageBucket: "undes-27404.firebasestorage.app",
  messagingSenderId: "392425028546",
  appId: "1:392425028546:web:6f24b527752361db68b45b",
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);

/* ================== API BASE ==================
  Render дээр хамгийн нийтлэг асуудал:
  - RENDER_BASE placeholder хэвээр байвал fetch нь fail → мод харагдахгүй.
  - Тиймээс fallback: window.location.origin (front+api нэг домэйнд бол шууд ажиллана)
*/
const RENDER_BASE = "https://YOUR-RENDER-SERVICE.onrender.com";

function resolveApiBase() {
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  if (isLocal) return "http://localhost:3000";

  // Хэрвээ чи RENDER_BASE-ээ солиогүй бол production дээр origin-оор fallback хийе
  if (!RENDER_BASE || RENDER_BASE.includes("YOUR-RENDER-SERVICE")) {
    return window.location.origin;
  }

  return RENDER_BASE;
}

const API_BASE = resolveApiBase();

function getStoredToken() {
  return localStorage.getItem("undes_token");
}

function authHeaders(extra = {}) {
  const token = getStoredToken();
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/* ================== CONSTANTS ================== */
const CARD_W = 150;
const CARD_H = 190;
const H_GAP = 60;
const V_GAP = 60;

/* ================== DATA MODEL ================== */
class FamilyMember {
  constructor({ id, name, age, sex, level, photoUrl }) {
    this.id = id;
    this.name = name || "";
    this.age = age || "";
    this.sex = sex || ""; // "male" | "female" | ""
    this.level = typeof level === "number" ? level : 0;

    // position
    this.x = 0;
    this.y = 0;

    // relationships
    this.parents = [];      // [fatherId?, motherId?] or [id,...] for unknown
    this.children = [];     // [id, ...]
    this.spouseId = null;   // 1 spouse

    // profile image
    this.photoUrl = photoUrl || "";

    // collapse ancestors
    this.collapseUp = false;
  }
}

let members = [];
let nextId = 1;

let treeRoot, nodesLayer, canvas, ctx;
let posMap = new Map(); // id -> {x,y}

// Person modal state
let modalMode = null;
let modalTarget = null;

// listeners (avoid duplicate)
let listenersBound = false;

/* ================== INIT ================== */
window.addEventListener("DOMContentLoaded", () => {
  treeRoot = document.getElementById("tree-root");
  nodesLayer = document.getElementById("tree-nodes");
  canvas = document.getElementById("tree-lines");

  // DOM байхгүй үед алдаа унагахгүй
  if (!treeRoot || !nodesLayer || !canvas) {
    console.warn("Tree DOM elements missing: #tree-root / #tree-nodes / #tree-lines");
    return;
  }

  ctx = canvas.getContext("2d");

  // жижиг хамгаалалт: positioning буруу байвал картууд харагдахгүй болчих гээд байдаг
  // CSS дээрээ хийсэн нь дээр ч, энд fallback тавьчихъя
  if (getComputedStyle(treeRoot).position === "static") treeRoot.style.position = "relative";
  if (getComputedStyle(nodesLayer).position === "static") nodesLayer.style.position = "absolute";

  onAuthStateChanged(auth, async (user) => {
    // Хэрвээ login биш бол шууд default root үүсгээд render хийнэ
    if (!user) {
      members = [];
      createDefaultRoot();
      bootstrapUI();
      return;
    }

    // Login байгаа үед backend-аас ачаална (token байхгүй байсан ч UI заавал гарна)
    await loadTreeFromJson();
    bootstrapUI();
  });
});

function bootstrapUI() {
  setupPersonModal();
  setupThemeButton();

  layoutTree();
  renderTree();

  bindGlobalListenersOnce();
}

function bindGlobalListenersOnce() {
  if (listenersBound) return;
  listenersBound = true;

  window.addEventListener("resize", () => {
    layoutTree();
    renderTree();
  });

  document.addEventListener("click", () => closeAllMenus());
}

/* ================== DEFAULT ROOT ================== */
function createDefaultRoot() {
  const me = new FamilyMember({
    id: 1,
    name: "Би",
    age: "",
    sex: "",
    level: 0,
    photoUrl: "img/profileson.jpg",
  });
  members = [me];
  nextId = 2;
}

/* ================== LOAD / SAVE ================== */
async function loadTreeFromJson() {
  try {
    const token = getStoredToken();

    // ⚠️ ЭНЭ БОЛ ГОЛ ЗАСВАР:
    // Token байхгүй үед өмнө нь return хийгээд render огт хийхгүй байсан.
    // Одоо: default root үүсгээд үргэлжлүүлнэ (UI-г bootstrapUI() асаана)
    if (!token) {
      members = [];
      createDefaultRoot();
      return;
    }

    const res = await fetch(`${API_BASE}/api/tree/load`, {
      method: "GET",
      headers: authHeaders(),
    });

    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.ok) throw new Error(out.error || "Load failed");

    const data = out.data || {};
    const rawMembers = Array.isArray(data.members) ? data.members : [];

    members = rawMembers.map((raw) => {
      const m = new FamilyMember(raw);
      m.parents = Array.isArray(raw.parents) ? raw.parents : [];
      m.children = Array.isArray(raw.children) ? raw.children : [];
      m.spouseId = raw.spouseId ?? null;
      m.collapseUp = !!raw.collapseUp;
      return m;
    });

    if (!members.length) createDefaultRoot();
  } catch (err) {
    console.error("Tree load error:", err);
    createDefaultRoot();
  }

  nextId = members.reduce((max, m) => (m.id > max ? m.id : max), 0) + 1;
}

async function saveTreeToJson() {
  try {
    const token = getStoredToken();
    if (!token) {
      console.warn("Not logged in: skip save");
      return;
    }

    const payload = { members };

    const res = await fetch(`${API_BASE}/api/tree/save`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });

    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.ok === false) console.warn("Save failed:", out);
  } catch (e) {
    console.error("Ургийн мод хадгалах үед алдаа:", e);
  }
}

/* ================== HELPERS ================== */
function findMember(id) {
  return members.find((m) => m.id === id);
}

function buildHiddenAncestorSet() {
  const hidden = new Set();

  members.forEach((m) => {
    if (!m.collapseUp) return;
    const stack = [...(m.parents || [])];

    while (stack.length) {
      const pid = stack.pop();
      if (hidden.has(pid)) continue;
      hidden.add(pid);
      const p = findMember(pid);
      if (p && Array.isArray(p.parents) && p.parents.length) stack.push(...p.parents);
    }
  });

  return hidden;
}

/* ================== LAYOUT ================== */
function layoutTree() {
  if (!treeRoot) return;

  const hiddenAnc = buildHiddenAncestorSet();
  const visibleMembers = members.filter((m) => !hiddenAnc.has(m.id));
  if (!visibleMembers.length) return;

  const levels = Array.from(new Set(visibleMembers.map((m) => m.level))).sort((a, b) => a - b);

  const paddingTop = 80;
  const rowGap = CARD_H + V_GAP;
  const containerWidth = treeRoot.clientWidth || 900;

  const newPosMap = new Map();

  levels.forEach((levelValue, rowIndex) => {
    const rowNodes = visibleMembers.filter((m) => m.level === levelValue);
    if (!rowNodes.length) return;

    // Anchor: эцэг эхийн X-үүдийн дундаж
    let hasAnchor = false;
    rowNodes.forEach((m) => {
      let anchor = 0;
      const parentPosList = (m.parents || [])
        .filter((pid) => !hiddenAnc.has(pid))
        .map((pid) => newPosMap.get(pid))
        .filter(Boolean);

      if (parentPosList.length > 0) {
        anchor = parentPosList.reduce((sum, p) => sum + p.x, 0) / parentPosList.length;
        hasAnchor = true;
      }
      m._anchor = anchor;
    });

    // couple unit
    const used = new Set();
    const units = [];

    rowNodes.forEach((m) => {
      if (used.has(m.id)) return;

      if (m.spouseId && !hiddenAnc.has(m.spouseId)) {
        const s = findMember(m.spouseId);
        if (s && s.level === levelValue && !used.has(s.id)) {
          units.push({ type: "couple", ids: [m.id, s.id] });
          used.add(m.id);
          used.add(s.id);
          return;
        }
      }

      units.push({ type: "single", ids: [m.id] });
      used.add(m.id);
    });

    const y = paddingTop + rowIndex * rowGap;
    const UNIT_WIDTH = CARD_W * 2.2;
    const MIN_DIST = UNIT_WIDTH + H_GAP * 0.2;

    // Anchor байхгүй бол төвд нь
    if (!hasAnchor) {
      const unitCount = units.length;
      const totalWidth = unitCount * UNIT_WIDTH + (unitCount - 1) * H_GAP;
      const startX = Math.max((containerWidth - totalWidth) / 2, 20);

      units.forEach((u, idx) => {
        const centerX = startX + idx * (UNIT_WIDTH + H_GAP) + UNIT_WIDTH / 2;

        if (u.type === "single") {
          const id = u.ids[0];
          newPosMap.set(id, { x: centerX, y });
        } else {
          const [id1, id2] = [...u.ids].sort((a, b) => a - b);
          const offset = CARD_W * 0.55;
          newPosMap.set(id1, { x: centerX - offset, y });
          newPosMap.set(id2, { x: centerX + offset, y });
        }
      });

      return;
    }

    // Anchor-тай үед: эцэг эхийн доор
    units.forEach((u) => {
      const anchors = u.ids.map((id) => {
        const mem = rowNodes.find((m) => m.id === id);
        return mem ? mem._anchor || 0 : 0;
      });

      let avg = anchors.reduce((sum, a) => sum + a, 0) / Math.max(anchors.length, 1);
      if (!avg || !isFinite(avg)) avg = 0;
      u.anchor = avg;
    });

    units.sort((a, b) => a.anchor - b.anchor);

    let currentX = null;
    units.forEach((u) => {
      let desired = u.anchor;
      if (!desired || !isFinite(desired)) desired = currentX == null ? containerWidth / 2 : currentX + MIN_DIST;

      let centerX;
      if (currentX == null) centerX = desired || containerWidth / 2;
      else centerX = Math.max(desired, currentX + MIN_DIST);

      u._centerX = centerX;
      currentX = centerX;
    });

    let minX = Math.min(...units.map((u) => u._centerX));
    let maxX = Math.max(...units.map((u) => u._centerX));
    const margin = 40;
    let shift = 0;

    if (maxX - minX < containerWidth) {
      const usedWidth = maxX - minX;
      shift = (containerWidth - usedWidth) / 2 - minX;
    } else if (minX < margin) {
      shift = margin - minX;
    }

    units.forEach((u) => {
      const cx = u._centerX + shift;

      if (u.type === "single") {
        const id = u.ids[0];
        newPosMap.set(id, { x: cx, y });
      } else {
        const [id1, id2] = [...u.ids].sort((a, b) => a - b);
        const offset = CARD_W * 0.55;
        newPosMap.set(id1, { x: cx - offset, y });
        newPosMap.set(id2, { x: cx + offset, y });
      }
    });
  });

  members.forEach((m) => {
    const pos = newPosMap.get(m.id);
    if (pos) {
      m.x = pos.x;
      m.y = pos.y;
    }
  });

  posMap = newPosMap;

  const totalHeight = paddingTop * 2 + (levels.length - 1) * rowGap + CARD_H;
  treeRoot.style.height = Math.max(450, totalHeight) + "px";
}

/* ================== RENDER ================== */
function layoutVisibleMembers() {
  const hiddenAnc = buildHiddenAncestorSet();
  return members.filter((m) => !hiddenAnc.has(m.id));
}

function renderTree() {
  if (!nodesLayer || !treeRoot || !canvas || !ctx) return;

  nodesLayer.innerHTML = "";

  const visibleMembers = layoutVisibleMembers();

  visibleMembers.forEach((m) => {
    const card = createFamilyCard(m);
    card.style.left = m.x - CARD_W / 2 + "px";
    card.style.top = m.y - CARD_H / 2 + "px";
    nodesLayer.appendChild(card);
  });

  resizeCanvas();
  drawLines(visibleMembers);
}

function resizeCanvas() {
  if (!treeRoot || !canvas) return;
  const rect = treeRoot.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width));
  canvas.height = Math.max(1, Math.floor(rect.height));
}

/* ================== CARD ================== */
function createFamilyCard(member) {
  const card = document.createElement("div");
  card.className = "family-card";
  if (member.sex === "male") card.classList.add("male");
  else if (member.sex === "female") card.classList.add("female");
  if (member.collapseUp) card.classList.add("collapse-up");

  // collapse ancestors button
  const btnUp = document.createElement("button");
  btnUp.className = "node-btn node-btn-up";
  btnUp.setAttribute("aria-label", "Дээш талын мөчир нугалах");
  const tri = document.createElement("span");
  tri.className = "triangle-up";
  btnUp.appendChild(tri);

  // add menu button
  const btnAdd = document.createElement("button");
  btnAdd.className = "node-btn node-btn-add";
  btnAdd.setAttribute("aria-label", "Шинэ хүн/харилцаа");

  // menu
  const menu = document.createElement("div");
  menu.className = "add-menu hidden";

  const btnFather = document.createElement("button");
  btnFather.className = "add-pill";
  btnFather.textContent = "Эцэг нэмэх";

  const btnMother = document.createElement("button");
  btnMother.className = "add-pill";
  btnMother.textContent = "Эх нэмэх";

  const btnSpouse = document.createElement("button");
  btnSpouse.className = "add-pill";
  btnSpouse.textContent = "Хань нэмэх";

  const btnChild = document.createElement("button");
  btnChild.className = "add-pill";
  btnChild.textContent = "Хүүхэд нэмэх";

  const btnEdit = document.createElement("button");
  btnEdit.className = "add-pill";
  btnEdit.textContent = "Мэдээлэл засах";

  const btnDelete = document.createElement("button");
  btnDelete.className = "add-pill danger";
  btnDelete.textContent = "Устгах";

  menu.append(btnFather, btnMother, btnSpouse, btnChild, btnEdit, btnDelete);

  // avatar
  const avatarWrap = document.createElement("div");
  avatarWrap.className = "card-avatar";
  const avatarCircle = document.createElement("div");
  avatarCircle.className = "avatar-circle";

  if (member.photoUrl) {
    const img = document.createElement("img");
    img.src = member.photoUrl;
    img.alt = member.name || "Профайл зураг";
    img.className = "avatar-img";
    avatarCircle.appendChild(img);
  } else {
    const avatarIcon = document.createElement("span");
    avatarIcon.className = "avatar-icon";
    avatarCircle.appendChild(avatarIcon);
  }

  avatarWrap.appendChild(avatarCircle);

  // name + age
  const nameBox = document.createElement("div");
  nameBox.className = "card-name";

  const full = document.createElement("div");
  full.className = "fullname";
  full.textContent = member.name || "Нэр тодорхойгүй";

  nameBox.appendChild(full);

  if (member.age) {
    const ageEl = document.createElement("div");
    ageEl.className = "card-age";
    ageEl.textContent = member.age + " настай";
    nameBox.appendChild(ageEl);
  }

  // compose
  card.append(btnUp, btnAdd, menu, avatarWrap, nameBox);

  // card click -> edit
  card.addEventListener("click", (e) => {
    e.stopPropagation();
    openPersonModal("edit", member);
  });

  btnAdd.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu(menu);
  });

  btnFather.addEventListener("click", (e) => {
    e.stopPropagation();
    openPersonModal("add-father", member, {
      sex: "male",
      name: "Эцэг",
      photoUrl: "img/profileman.avif",
    });
    closeAllMenus();
  });

  btnMother.addEventListener("click", (e) => {
    e.stopPropagation();
    openPersonModal("add-mother", member, {
      sex: "female",
      name: "Эх",
      photoUrl: "img/profilewoman.jpg",
    });
    closeAllMenus();
  });

  btnSpouse.addEventListener("click", (e) => {
    e.stopPropagation();
    openPersonModal("add-spouse", member, {
      name: "Хань",
      photoUrl: "img/profilespouse.jpg",
    });
    closeAllMenus();
  });

  btnChild.addEventListener("click", (e) => {
    e.stopPropagation();
    openPersonModal("add-child", member, {
      name: "Хүүхэд",
      photoUrl: "img/profileson.jpg",
    });
    closeAllMenus();
  });

  btnEdit.addEventListener("click", (e) => {
    e.stopPropagation();
    openPersonModal("edit", member);
    closeAllMenus();
  });

  btnDelete.addEventListener("click", (e) => {
    e.stopPropagation();
    deletePerson(member);
    closeAllMenus();
  });

  // fold ancestors
  btnUp.addEventListener("click", (e) => {
    e.stopPropagation();
    member.collapseUp = !member.collapseUp;
    layoutTree();
    renderTree();
    saveTreeToJson();
  });

  return card;
}

/* ================== MENU ================== */
function toggleMenu(menu) {
  closeAllMenus();
  menu.classList.toggle("hidden");
}

function closeAllMenus() {
  document.querySelectorAll(".add-menu").forEach((m) => m.classList.add("hidden"));
}

/* ================== MODAL ================== */
function setupPersonModal() {
  const backdrop = document.getElementById("person-backdrop");
  const modal = document.getElementById("person-modal");
  const form = document.getElementById("person-form");
  const btnCancel = document.getElementById("person-cancel");

  if (!backdrop || !modal || !form || !btnCancel) {
    console.warn("Person modal elements not found, skipping modal setup");
    return;
  }

  // duplicate listener-ээс хамгаалалт
  if (form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  btnCancel.addEventListener("click", closePersonModal);
  backdrop.addEventListener("click", closePersonModal);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitPersonForm();
  });
}

function openPersonModal(mode, targetMember, preset = {}) {
  modalMode = mode;
  modalTarget = targetMember;

  const modal = document.getElementById("person-modal");
  const backdrop = document.getElementById("person-backdrop");
  const title = document.getElementById("person-modal-title");
  const nameInput = document.getElementById("person-name");
  const ageInput = document.getElementById("person-age");
  const sexSelect = document.getElementById("person-sex");
  const photoInput = document.getElementById("person-photo");

  if (!modal || !backdrop || !title || !nameInput || !ageInput || !sexSelect) {
    console.warn("Modal elements missing");
    return;
  }

  if (mode === "edit" && targetMember) {
    title.textContent = "Хүн засах";
    nameInput.value = targetMember.name || "";
    ageInput.value = targetMember.age || "";
    sexSelect.value = targetMember.sex || "";
    if (photoInput) photoInput.value = targetMember.photoUrl || "";
  } else {
    title.textContent = "Хүн нэмэх";
    nameInput.value = preset.name || "";
    ageInput.value = "";
    sexSelect.value = preset.sex || "";
    if (photoInput) photoInput.value = preset.photoUrl || "";
  }

  backdrop.hidden = false;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("show"));
}

function closePersonModal() {
  const modal = document.getElementById("person-modal");
  const backdrop = document.getElementById("person-backdrop");
  if (!modal || !backdrop) return;

  modal.classList.remove("show");
  setTimeout(() => {
    modal.hidden = true;
    backdrop.hidden = true;
  }, 180);
}

function submitPersonForm() {
  const nameInput = document.getElementById("person-name");
  const ageInput = document.getElementById("person-age");
  const sexSelect = document.getElementById("person-sex");
  const photoInput = document.getElementById("person-photo");

  if (!nameInput || !ageInput || !sexSelect) return;

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

  saveTreeToJson();
  closePersonModal();
  layoutTree();
  renderTree();
}

/* ================== ADD / EDIT / DELETE ================== */
function normalizeSex(str) {
  const s = (str || "").toLowerCase();
  if (s === "male" || s === "эр" || s === "эрэгтэй") return "male";
  if (s === "female" || s === "эм" || s === "эмэгтэй") return "female";
  return "";
}

function addFatherWithData(child, data) {
  child.parents = Array.isArray(child.parents) ? child.parents : [];
  if (child.parents[0]) {
    alert("Эцэг аль хэдийн бүртгэлтэй байна.");
    return;
  }

  const father = new FamilyMember({
    id: nextId++,
    name: data.name || "Эцэг",
    age: data.age,
    sex: "male",
    level: child.level - 1,
    photoUrl: data.photoUrl || "img/profileman.avif",
  });

  father.children.push(child.id);
  child.parents[0] = father.id;

  if (child.parents[1]) {
    const mother = findMember(child.parents[1]);
    if (mother) {
      father.spouseId = mother.id;
      mother.spouseId = father.id;
    }
  }

  members.push(father);
}

function addMotherWithData(child, data) {
  child.parents = Array.isArray(child.parents) ? child.parents : [];
  if (child.parents[1]) {
    alert("Эх аль хэдийн бүртгэлтэй байна.");
    return;
  }

  const mother = new FamilyMember({
    id: nextId++,
    name: data.name || "Эх",
    age: data.age,
    sex: "female",
    level: child.level - 1,
    photoUrl: data.photoUrl || "img/profilewoman.jpg",
  });

  mother.children.push(child.id);
  child.parents[1] = mother.id;

  if (child.parents[0]) {
    const father = findMember(child.parents[0]);
    if (father) {
      mother.spouseId = father.id;
      father.spouseId = mother.id;
    }
  }

  members.push(mother);
}

function addSpouseWithData(person, data) {
  if (person.spouseId) {
    alert("Хань аль хэдийн бүртгэлтэй байна.");
    return;
  }

  const spouse = new FamilyMember({
    id: nextId++,
    name: data.name || "Хань",
    age: data.age,
    sex: normalizeSex(data.sex),
    level: person.level,
    photoUrl: data.photoUrl || "img/profilespouse.jpg",
  });

  spouse.spouseId = person.id;
  person.spouseId = spouse.id;

  members.push(spouse);
}

function addChildWithData(parent, data) {
  parent.children = Array.isArray(parent.children) ? parent.children : [];

  const child = new FamilyMember({
    id: nextId++,
    name: data.name || "Хүүхэд",
    age: data.age,
    sex: normalizeSex(data.sex),
    level: parent.level + 1,
    photoUrl: data.photoUrl || "img/profileson.jpg",
  });

  parent.children.push(child.id);

  child.parents = Array.isArray(child.parents) ? child.parents : [];
  if (parent.sex === "male") child.parents[0] = parent.id;
  else if (parent.sex === "female") child.parents[1] = parent.id;
  else if (!child.parents.includes(parent.id)) child.parents.push(parent.id);

  if (parent.spouseId) {
    const spouse = findMember(parent.spouseId);
    if (spouse) {
      spouse.children = Array.isArray(spouse.children) ? spouse.children : [];
      spouse.children.push(child.id);

      if (spouse.sex === "male") child.parents[0] = spouse.id;
      else if (spouse.sex === "female") child.parents[1] = spouse.id;
      else if (!child.parents.includes(spouse.id)) child.parents.push(spouse.id);
    }
  }

  members.push(child);
}

function editPersonWithData(member, data) {
  member.name = data.name || member.name;
  member.age = data.age || "";
  member.sex = normalizeSex(data.sex);

  // photoUrl: хоосон биш үед л шинэчилнэ
  if (typeof data.photoUrl !== "undefined" && data.photoUrl !== "") {
    member.photoUrl = data.photoUrl;
  }
}

function deletePerson(member) {
  if (member.level === 0 && members.length === 1) {
    alert("Үндсэн 'Би' node-ийг устгах боломжгүй.");
    return;
  }
  if (!confirm("Энэ хүнийг устгах уу?")) return;

  const id = member.id;

  members.forEach((m) => {
    m.children = (m.children || []).filter((cid) => cid !== id);
    m.parents = (m.parents || []).filter((pid) => pid !== id);
    if (m.spouseId === id) m.spouseId = null;
  });

  members = members.filter((m) => m.id !== id);

  saveTreeToJson();
  layoutTree();
  renderTree();
}

/* ================== THEME ================== */
function setupThemeButton() {
  const btnTheme = document.getElementById("btn-theme");
  if (!btnTheme) return;

  if (btnTheme.dataset.bound === "1") return;
  btnTheme.dataset.bound = "1";

  btnTheme.addEventListener("click", (e) => {
    e.stopPropagation();
    document.body.classList.toggle("dark");
  });
}

/* ================== DRAW LINES ================== */
function drawLines(visibleMembers) {
  if (!ctx || !canvas) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#8a6a4a";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";

  const visibleIds = new Set(visibleMembers.map((m) => m.id));

  // 1) spouse
  visibleMembers.forEach((m) => {
    if (!m.spouseId) return;
    if (!visibleIds.has(m.spouseId)) return;

    const spouse = findMember(m.spouseId);
    if (!spouse) return;
    if (m.id > spouse.id) return;

    const p1 = posMap.get(m.id);
    const p2 = posMap.get(spouse.id);
    if (!p1 || !p2) return;

    const y = p1.y;

    ctx.beginPath();
    ctx.moveTo(p1.x + CARD_W * 0.3, y);
    ctx.lineTo(p2.x - CARD_W * 0.3, y);
    ctx.stroke();
  });

  // 2) two parents group
  const pairMap = new Map();

  visibleMembers.forEach((child) => {
    const parentsArr = (child.parents || []).filter((id) => visibleIds.has(id));
    if (parentsArr.length < 2) return;

    const [a, b] = parentsArr;
    const p1 = Math.min(a, b);
    const p2 = Math.max(a, b);
    const key = `${p1}-${p2}`;

    if (!pairMap.has(key)) pairMap.set(key, { parents: [p1, p2], children: [] });
    pairMap.get(key).children.push(child.id);
  });

  pairMap.forEach((group) => {
    const [p1id, p2id] = group.parents;
    const parent1Pos = posMap.get(p1id);
    const parent2Pos = posMap.get(p2id);
    if (!parent1Pos || !parent2Pos) return;

    const childrenPos = group.children.map((id) => posMap.get(id)).filter(Boolean);
    if (!childrenPos.length) return;

    const parentBottomY = parent1Pos.y + CARD_H / 2;
    const childTopY = childrenPos[0].y - CARD_H / 2;

    const midParentX = (parent1Pos.x + parent2Pos.x) / 2;

    const parentsBarY = parentBottomY + 16;
    const minChildX = Math.min(...childrenPos.map((c) => c.x));
    const maxChildX = Math.max(...childrenPos.map((c) => c.x));
    const siblingY = childTopY - 20;

    ctx.beginPath();

    ctx.moveTo(parent1Pos.x, parentBottomY);
    ctx.lineTo(parent1Pos.x, parentsBarY);

    ctx.moveTo(parent2Pos.x, parentBottomY);
    ctx.lineTo(parent2Pos.x, parentsBarY);

    ctx.moveTo(parent1Pos.x, parentsBarY);
    ctx.lineTo(parent2Pos.x, parentsBarY);

    ctx.moveTo(midParentX, parentsBarY);
    ctx.lineTo(midParentX, siblingY);

    ctx.moveTo(minChildX, siblingY);
    ctx.lineTo(maxChildX, siblingY);

    childrenPos.forEach((pos) => {
      ctx.moveTo(pos.x, siblingY);
      ctx.lineTo(pos.x, childTopY);
    });

    ctx.stroke();
  });

  // 3) single parent
  visibleMembers.forEach((child) => {
    const parentsArr = (child.parents || []).filter((id) => visibleIds.has(id));
    if (parentsArr.length !== 1) return;

    const parentId = parentsArr[0];
    const p = posMap.get(parentId);
    const c = posMap.get(child.id);
    if (!p || !c) return;

    const parentBottom = p.y + CARD_H / 2;
    const childTop = c.y - CARD_H / 2;
    const midY = (parentBottom + childTop) / 2;

    ctx.beginPath();
    ctx.moveTo(p.x, parentBottom);
    ctx.lineTo(p.x, midY);
    ctx.lineTo(c.x, midY);
    ctx.lineTo(c.x, childTop);
    ctx.stroke();
  });
}
