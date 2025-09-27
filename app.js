// app.js (module)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js";
import { getStorage, ref as sRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage-compat.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, deleteDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js";

/* ========== CONFIGURATION ========== */
/* Replace with your Firebase project config */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_BUCKET.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth();
const storage = getStorage();
const db = getFirestore();

const provider = new GoogleAuthProvider();

/* ========== UI ELEMENTS ========== */
const signInBtn = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const userGreeting = document.getElementById('userGreeting');

const shareForm = document.getElementById('shareForm');
const authorInput = document.getElementById('author');
const titleInput = document.getElementById('title');
const placeInput = document.getElementById('place');
const imageInput = document.getElementById('image');
const storyInput = document.getElementById('story');
const submitStatus = document.getElementById('submitStatus');
const clearFormBtn = document.getElementById('clearFormBtn');

const feedEl = document.getElementById('feed');
const galleryEl = document.getElementById('gallery');
const loadMoreBtn = document.getElementById('loadMoreBtn');

let currentUser = null;
let pageLimit = 8;

/* ========== AUTH FLOW ========== */
signInBtn.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error(e);
    alert('Sign-in failed.');
  }
});
signOutBtn.addEventListener('click', async () => {
  await signOut(auth);
});
onAuthStateChanged(auth, user => {
  currentUser = user;
  if (user) {
    userGreeting.textContent = `Hello, ${user.displayName || user.email}`;
    signInBtn.hidden = true;
    signOutBtn.hidden = false;
    if (!authorInput.value) authorInput.value = user.displayName || user.email.split('@')[0];
  } else {
    userGreeting.textContent = 'Welcome';
    signInBtn.hidden = false;
    signOutBtn.hidden = true;
  }
});

/* ========== CLIENT-SIDE IMAGE RESIZE + COMPRESS ========== */
function resizeImage(file, maxWidth = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return resolve(null);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((maxWidth / width) * height);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        URL.revokeObjectURL(url);
        resolve(new File([blob], file.name, { type: blob.type }));
      }, 'image/jpeg', quality);
    };
    img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); };
    img.src = url;
  });
}

/* ========== POST SUBMISSION ========== */
shareForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser) { submitStatus.textContent = 'Sign in to post.'; return; }

  const title = titleInput.value.trim();
  const story = storyInput.value.trim();
  if (!title || !story) { submitStatus.textContent = 'Title and story required.'; return; }

  submitStatus.style.color = '#f1f1f1';
  submitStatus.textContent = 'Preparing image...';

  let imageFile = imageInput.files && imageInput.files[0];
  if (imageFile && imageFile.size > 10 * 1024 * 1024) {
    // Resize/compress large images
    try { imageFile = await resizeImage(imageFile, 1600, 0.75); }
    catch { /* continue with original if resize fails */ }
  }

  let imageUrl = '';
  if (imageFile) {
    submitStatus.textContent = 'Uploading image...';
    const filePath = `posts/${currentUser.uid}/${Date.now()}_${imageFile.name}`;
    const ref = sRef(storage, filePath);
    const uploadTask = uploadBytesResumable(ref, imageFile);

    // progress UI (basic)
    uploadTask.on('state_changed', (snapshot) => {
      const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      submitStatus.textContent = `Uploading image... ${pct}%`;
    }, (err) => {
      console.error(err);
      submitStatus.textContent = 'Upload failed.';
    });

    await uploadTask;
    imageUrl = await getDownloadURL(ref);
  }

  submitStatus.textContent = 'Posting...';
  try {
    await addDoc(collection(db, 'posts'), {
      uid: currentUser.uid,
      author: (authorInput.value || currentUser.displayName || 'Anonymous'),
      title,
      story,
      location: placeInput.value || '',
      imageUrl,
      createdAt: serverTimestamp(),
      likes: 0,
      flagged: false  // moderation flag (client-side default)
    });
    submitStatus.style.color = '#bff7d0';
    submitStatus.textContent = 'Posted successfully!';
    shareForm.reset();
  } catch (err) {
    console.error(err);
    submitStatus.style.color = '#f7c0c0';
    submitStatus.textContent = 'Failed to save post.';
  }
});

/* ========== FEED & GALLERY (realtime snapshot) ========== */
async function loadInitialPosts(limitCount = 12) {
  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function renderPost(post) {
  const tpl = document.getElementById('postTemplate');
  const clone = tpl.content.cloneNode(true);
  const img = clone.querySelector('.post-image');
  const titleEl = clone.querySelector('.post-title');
  const textEl = clone.querySelector('.post-text');
  const dateEl = clone.querySelector('.date');
  const placeEl = clone.querySelector('.place');
  const authorEl = clone.querySelector('.author');
  const likeBtn = clone.querySelector('.likeBtn');
  const deleteBtn = clone.querySelector('.deleteBtn');

  img.src = post.imageUrl || '';
  img.alt = post.title || 'photo';
  titleEl.textContent = post.title || '';
  textEl.textContent = post.story || '';
  authorEl.textContent = `— ${post.author || 'Anonymous'}`;
  placeEl.textContent = post.location || '';
  const ts = post.createdAt && post.createdAt.toDate ? post.createdAt.toDate() : new Date();
  dateEl.textContent = ts.toLocaleString();

  // like button (optimistic local update)
  likeBtn.textContent = `Like (${post.likes || 0})`;
  likeBtn.addEventListener('click', async () => {
    // For demo: client-side increment (server rules should enforce)
    try {
      const docRef = doc(db, 'posts', post.id);
      // In production use a transaction or callable to increment atomically
      await addDoc(collection(db, `posts/${post.id}/likes_dummy`), { t: Date.now() });
    } catch (e) { console.error(e); }
  });

  // delete if owner
  if (currentUser && currentUser.uid === post.uid) {
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Delete this post?')) return;
      try {
        await deleteDoc(doc(db, 'posts', post.id));
      } catch (e) { console.error(e); alert('Delete failed.'); }
    });
  } else {
    deleteBtn.hidden = true;
  }

  // image lightbox
  img.addEventListener('click', () => openLightbox(post.imageUrl || '', post.title || ''));

  return clone;
}

function renderFeed(posts) {
  feedEl.innerHTML = '';
  if (!posts.length) {
    feedEl.innerHTML = '<div class="card muted">No posts yet — be the first.</div>';
    return;
  }
  posts.forEach(p => feedEl.appendChild(renderPost(p)));
}

function renderGallery(posts) {
  galleryEl.innerHTML = '';
  posts.slice(0, pageLimit).forEach(p => {
    const el = document.createElement('figure');
    el.className = 'g-thumb';
    el.innerHTML = `<img src="${p.imageUrl || ''}" alt="${escapeHtml(p.title || '')}"><figcaption class="cap">${escapeHtml(p.title || '')}</figcaption>`;
    el.querySelector('img').addEventListener('click', () => openLightbox(p.imageUrl || '', p.title));
    galleryEl.appendChild(el);
  });
}

/* realtime listener for posts collection (keeps feed updated for all devices) */
onSnapshot(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50)), (snapshot) => {
  const posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  renderFeed(posts);
  renderGallery(posts);
});

/* ========== LIGHTBOX ========== */
function openLightbox(src, caption) {
  if (!src) return;
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = 0;
  overlay.style.background = 'rgba(0,0,0,0.9)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = 9999;
  overlay.style.cursor = 'zoom-out';

  const img = document.createElement('img');
  img.src = src; img.alt = caption || 'photo';
  img.style.maxWidth = '94%'; img.style.maxHeight = '92%'; img.style.borderRadius = '10px';
  overlay.appendChild(img);

  overlay.addEventListener('click', () => document.body.removeChild(overlay));
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape' && document.body.contains(overlay)) {
      document.body.removeChild(overlay);
      document.removeEventListener('keydown', esc);
    }
  });
  document.body.appendChild(overlay);
}

/* ========== HELPERS ========== */
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ========== UI CONTROLS ========== */
clearFormBtn.addEventListener('click', () => shareForm.reset());
loadMoreBtn.addEventListener('click', () => {
  pageLimit = pageLimit + 8;
  // Re-render gallery using the latest snapshot via listener
});

/* End of app.js */