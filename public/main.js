console.log("🚀 main.js is running");

const SUPABASE_URL = "https://qnphvvpvhqjlcztqhddt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFucGh2dnB2aHFqbGN6dHFoZGR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5ODM5NDEsImV4cCI6MjA3NDU1OTk0MX0.b3aF1NddQYr4_-TE3cxPGygRq4CRS5a1-_MbohqOcew";
const API_BASE = "http://localhost:4000";

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// UI elements
const authBtn = document.getElementById("authBtn");
const signUpBtn = document.getElementById("signUpBtn");
const signOutBtn = document.getElementById("signOutBtn");
const userGreeting = document.getElementById("userGreeting");
const statusEl = document.getElementById("status");
const feedEl = document.getElementById("feed");
const galleryEl = document.getElementById("gallery");
const shareForm = document.getElementById("shareForm");
const postTpl = document.getElementById("postTpl");

// Modal elements
const authModal = document.getElementById("authModal");
const modalTitle = document.getElementById("modalTitle");
const authForm = document.getElementById("authForm");
const modalEmail = document.getElementById("modalEmail");
const modalPassword = document.getElementById("modalPassword");
const modalMessage = document.getElementById("modalMessage");
const closeModal = document.getElementById("closeModal");

let currentUser = null;
let isSignup = false;

function setStatus(msg, color) {
  statusEl.textContent = msg || "";
  statusEl.style.color = color || "";
}

function showModal(signup = false) {
  isSignup = signup;
  modalTitle.textContent = signup ? "Sign Up" : "Sign In";
  modalMessage.textContent = "";
  modalEmail.value = "";
  modalPassword.value = "";
  authModal.classList.remove("hidden");
}

function hideModal() {
  authModal.classList.add("hidden");
}

async function refreshUser() {
  const session = (await supabase.auth.getSession()).data.session;
  currentUser = session ? session.user : null;
  if (currentUser) {
    userGreeting.textContent = `Hello, ${currentUser.user_metadata?.full_name || currentUser.email.split("@")[0]}`;
    authBtn.hidden = true;
    signUpBtn.hidden = true;
    signOutBtn.hidden = false;
  } else {
    userGreeting.textContent = "Welcome";
    authBtn.hidden = false;
    signUpBtn.hidden = false;
    signOutBtn.hidden = true;
  }
}

// Open modal
authBtn?.addEventListener("click", () => showModal(false));
signUpBtn?.addEventListener("click", () => showModal(true));
closeModal?.addEventListener("click", hideModal);

// ✅ Confirm form exists
if (!authForm) {
  console.warn("⚠️ authForm not found");
} else {
  console.log("✅ authForm found");

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    console.log("✅ authForm submit triggered");

    const email = modalEmail.value.trim();
    const password = modalPassword.value.trim();
    modalMessage.textContent = "";

    if (!email || !password) {
      modalMessage.textContent = "Email and password required";
      return;
    }

    modalMessage.textContent = isSignup ? "Signing up..." : "Signing in...";
    console.log("🔐 Attempting sign-in with:", email);
    console.log("🧠 isSignup:", isSignup);

    try {
      const action = isSignup
        ? supabase.auth.signUp({ email, password })
        : supabase.auth.signInWithPassword({ email, password });

      const { data, error } = await action;
      console.log("✅ Supabase response:", { data, error });

      if (error) {
        console.error("Auth error:", error.message);
        modalMessage.textContent = error.message;
        return;
      }

      if (!data.session && !isSignup) {
        modalMessage.textContent = "Sign-in failed: No session returned";
        return;
      }

      modalMessage.textContent = isSignup
        ? "Signup successful! Check your email to confirm."
        : "Signed in successfully!";
      hideModal();
      await refreshUser();
    } catch (err) {
      console.error("Unexpected error:", err);
      modalMessage.textContent = "Something went wrong. Try again.";
    }
  });
}

// Sign out
signOutBtn?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  await refreshUser();
});

// Listen to auth changes
supabase.auth.onAuthStateChange((_event, _session) => refreshUser());
refreshUser();

// Load posts
async function loadPosts() {
  setStatus("Loading posts...");
  try {
    const res = await fetch(`${API_BASE}/api/posts?limit=40`);
    const json = await res.json();
    renderPosts(json.posts || []);
    setStatus("");
  } catch (err) {
    console.error("Fetch error:", err);
    setStatus("Failed to load posts", "red");
  }
}

function renderPosts(posts) {
  feedEl.innerHTML = "";
  if (!posts.length) {
    feedEl.innerHTML = '<div class="card">No posts yet.</div>';
    return;
  }

  posts.forEach(p => {
    const node = postTpl.content.cloneNode(true);
    node.querySelector(".post-image").src = p.image_url || "";
    node.querySelector(".post-title").textContent = p.title || "";
    node.querySelector(".post-text").textContent = p.story || "";
    node.querySelector(".place").textContent = p.location || "";
    node.querySelector(".author").textContent = `— ${p.author_display_name || "Anonymous"}`;
    node.querySelector(".date").textContent = new Date(p.created_at).toLocaleString();
    feedEl.appendChild(node);
  });

  galleryEl.innerHTML = "";
  posts.filter(p => p.image_url).slice(0, 12).forEach(p => {
    const fig = document.createElement("figure");
    fig.className = "g-thumb";
    fig.innerHTML = `<img src="${p.image_url}" alt="${p.title || 'Post image'}">`;
    galleryEl.appendChild(fig);
  });
}

// Handle form submission
shareForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("Preparing post...");

  if (!currentUser) {
    setStatus("Sign in to post", "red");
    return;
  }

  const title = document.getElementById("title").value.trim();
  const location = document.getElementById("location").value.trim();
  const story = document.getElementById("story").value.trim();
  const file = document.getElementById("image").files[0];

  if (!title || !story || title.length > 200 || story.length > 2000) {
    setStatus("Title and story required (within limits)", "red");
    return;
  }

  const form = new FormData();
  form.append("title", title);
  form.append("story", story);
  form.append("location", location);
  if (file) form.append("image", file);

  setStatus("Uploading…");

  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) {
      setStatus("Sign in again", "red");
      return;
    }

    const resp = await fetch(`${API_BASE}/api/posts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });

    const json = await resp.json();
    if (!resp.ok) {
      setStatus(json.error || "Post failed", "red");
      return;
    }

    setStatus("Posted successfully", "green");
    shareForm.reset();
    loadPosts();
  } catch (err) {
    console.error("Post error:", err);
    setStatus("Post error", "red");
  }
});

// Clear form
document.getElementById("clearBtn")?.addEventListener("click", () => {
  shareForm.reset();
  setStatus("");
});