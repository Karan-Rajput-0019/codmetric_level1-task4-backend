// public/main.js (ES module)
const SUPABASE_URL = "<https://qnphvvpvhqjlcztqhddt.supabase.co>"; // e.g. https://abcxyz.supabase.co
const SUPABASE_ANON_KEY = "<eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFucGh2dnB2aHFqbGN6dHFoZGR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5ODM5NDEsImV4cCI6MjA3NDU1OTk0MX0.b3aF1NddQYr4_-TE3cxPGygRq4CRS5a1-_MbohqOcew>";
const API_BASE = "<http://localhost:4000>"; // e.g. https://your-render-app.onrender.com or ""

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authBtn = document.getElementById("authBtn");
const signOutBtn = document.getElementById("signOutBtn");
const userGreeting = document.getElementById("userGreeting");
const statusEl = document.getElementById("status");
const feedEl = document.getElementById("feed");
const galleryEl = document.getElementById("gallery");
const shareForm = document.getElementById("shareForm");
const postTpl = document.getElementById("postTpl");

let currentUser = null;

function setStatus(msg, color) {
  statusEl.textContent = msg || "";
  if (color) statusEl.style.color = color;
  else statusEl.style.color = "";
}

async function refreshUser() {
  const session = supabase.auth.getSession ? (await supabase.auth.getSession()).data.session : null;
  currentUser = session ? session.user : null;
  if (currentUser) {
    userGreeting.textContent = `Hello, ${currentUser.user_metadata?.full_name || currentUser.email.split("@")[0]}`;
    authBtn.hidden = true;
    signOutBtn.hidden = false;
  } else {
    userGreeting.textContent = "Welcome";
    authBtn.hidden = false;
    signOutBtn.hidden = true;
  }
}

// Auth: popup with provider (Google)
authBtn.addEventListener("click", async () => {
  setStatus("Signing in...");
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google" });
  if (error) setStatus("Sign-in failed", "red");
});

// Sign out
signOutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  await refreshUser();
});

// Listen to auth changes
if (supabase.auth.onAuthStateChange) {
  supabase.auth.onAuthStateChange((_event, session) => {
    refreshUser();
  });
}
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
    console.error(err);
    setStatus("Failed to load posts", "red");
  }
}

function renderPosts(posts) {
  // feed
  const feedContainer = document.createElement("div");
  feedContainer.className = "feed-list";
  feedEl.innerHTML = "";
  if (!posts.length) feedEl.innerHTML = '<div class="card">No posts yet.</div>';
  posts.forEach(p => {
    const node = postTpl.content.cloneNode(true);
    const img = node.querySelector(".post-image");
    const title = node.querySelector(".post-title");
    const text = node.querySelector(".post-text");
    const date = node.querySelector(".date");
    const place = node.querySelector(".place");
    const author = node.querySelector(".author");

    img.src = p.image_url || "";
    title.textContent = p.title || "";
    text.textContent = p.story || "";
    place.textContent = p.location || "";
    author.textContent = `— ${p.author_display_name || "Anonymous"}`;
    date.textContent = new Date(p.created_at).toLocaleString();

    feedEl.appendChild(node);
  });

  // gallery
  galleryEl.innerHTML = "";
  posts.filter(p => p.image_url).slice(0, 12).forEach(p => {
    const fig = document.createElement("figure");
    fig.className = "g-thumb";
    fig.innerHTML = `<img src="${p.image_url}" alt="${p.title || ''}">`;
    galleryEl.appendChild(fig);
  });
}

// Submit form: upload to backend endpoint which forwards to Supabase storage
shareForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("Preparing post...");
  if (!currentUser) { setStatus("Sign in to post", "red"); return; }

  const title = document.getElementById("title").value.trim();
  const location = document.getElementById("location").value.trim();
  const story = document.getElementById("story").value.trim();
  const fileInput = document.getElementById("image");
  const file = fileInput.files[0];

  if (!title || !story) { setStatus("Title and story required", "red"); return; }

  const form = new FormData();
  form.append("title", title);
  form.append("story", story);
  form.append("location", location);
  if (file) form.append("image", file);

  setStatus("Uploading…");

  try {
    const sessionResult = await supabase.auth.getSession();
    const token = sessionResult?.data?.session?.access_token;
    if (!token) { setStatus("Sign in again", "red"); return; }

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
    console.error(err);
    setStatus("Post error", "red");
  }
});

// Clear
document.getElementById("clearBtn").addEventListener("click", () => {
  shareForm.reset();
  setStatus("");
});

// Initial load
loadPosts();