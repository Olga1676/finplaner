/*
 * sync.js — связь с облачной базой Firebase (общая для всей семьи).
 *  • вход через Google-аккаунт;
 *  • записи, план и настройки хранятся в Firestore и сразу видны всем;
 *  • без интернета записи сохраняются в телефоне и отправляются позже.
 *
 * Как устроена база:
 *   entries/{id}   — одна трата или поступление: kind, ym, date, item, amount, note, by
 *   months/{ym}    — план и накопления месяца
 *   settings/main  — валюта и свои статьи
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch, arrayUnion, arrayRemove,
  deleteField, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export function createSync(config, handlers) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  // Сырые данные из базы — из них app.js собирает state.
  const raw = { entries: new Map(), months: new Map(), settings: {} };
  let ready = { entries: false, months: false, settings: false };
  let unsubs = [];
  let user = null;

  function emit() {
    handlers.onData(raw, ready.entries && ready.months && ready.settings);
  }
  function fail(err) {
    handlers.onError(err && err.code === 'permission-denied' ? 'denied' : 'error', err);
  }

  function subscribe() {
    unsubs.forEach(u => u());
    raw.entries.clear(); raw.months.clear(); raw.settings = {};
    ready = { entries: false, months: false, settings: false };
    unsubs = [
      onSnapshot(collection(db, 'entries'), snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type === 'removed') raw.entries.delete(ch.doc.id);
          else raw.entries.set(ch.doc.id, Object.assign({ id: ch.doc.id }, ch.doc.data()));
        });
        ready.entries = true; emit();
      }, fail),
      onSnapshot(collection(db, 'months'), snap => {
        snap.docChanges().forEach(ch => {
          if (ch.type === 'removed') raw.months.delete(ch.doc.id);
          else raw.months.set(ch.doc.id, ch.doc.data());
        });
        ready.months = true; emit();
      }, fail),
      onSnapshot(doc(db, 'settings', 'main'), snap => {
        raw.settings = snap.exists() ? snap.data() : {};
        ready.settings = true; emit();
      }, fail),
    ];
  }

  onAuthStateChanged(auth, u => {
    user = u;
    if (u) subscribe();
    else { unsubs.forEach(f => f()); unsubs = []; }
    handlers.onAuth(u);
  });
  getRedirectResult(auth).catch(err => handlers.onError('login', err));

  const who = () => (user && (user.displayName || user.email || '').split(' ')[0]) || '';
  const report = p => p.catch(fail);   // при офлайне промис ждёт сети — это нормально

  return {
    async signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await signInWithPopup(auth, provider);
      } catch (err) {
        // В режиме «на экране Домой» окна-попапы иногда запрещены — пробуем через переход.
        if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment')) {
          await signInWithRedirect(auth, provider);
        } else if (err && err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
          handlers.onError('login', err);
        }
      }
    },
    signOut() { return signOut(auth); },

    saveEntry(kind, entry) {
      const data = {
        kind, ym: (entry.date || '').slice(0, 7) || entry.ym, date: entry.date || '',
        item: entry.item, amount: entry.amount, note: entry.note || '',
        by: entry.by || who(), updatedAt: serverTimestamp(),
      };
      return report(setDoc(doc(db, 'entries', entry.id), data));
    },
    deleteEntry(id) { return report(deleteDoc(doc(db, 'entries', id))); },

    setPlan(ym, group, cat, n) {
      return report(setDoc(doc(db, 'months', ym),
        { plan: { [group]: { [cat]: n > 0 ? n : deleteField() } } }, { merge: true }));
    },
    setSaving(ym, key, n) {
      return report(setDoc(doc(db, 'months', ym), { savings: { [key]: n } }, { merge: true }));
    },
    replaceMonth(ym, plan, savings) {
      return report(setDoc(doc(db, 'months', ym), { plan, savings }));
    },

    setCurrency(c) { return report(setDoc(doc(db, 'settings', 'main'), { currency: c }, { merge: true })); },
    addItem(field, item) {
      return report(setDoc(doc(db, 'settings', 'main'), { [field]: arrayUnion(item) }, { merge: true }));
    },
    removeItem(field, item) {
      return report(setDoc(doc(db, 'settings', 'main'), { [field]: arrayRemove(item) }, { merge: true }));
    },

    /** Загрузка резервной копии: добавляет все записи, план и настройки (пачками по 400). */
    async importState(state) {
      const ops = [];
      Object.keys(state.months).forEach(ym => {
        const m = state.months[ym];
        ops.push(b => b.set(doc(db, 'months', ym), { plan: m.plan, savings: m.savings }));
        m.expenses.forEach(e => ops.push(b => b.set(doc(db, 'entries', e.id),
          { kind: 'expense', ym, date: e.date, item: e.item, amount: e.amount, note: e.note, by: e.by || who() })));
        m.incomes.forEach(e => ops.push(b => b.set(doc(db, 'entries', e.id),
          { kind: 'income', ym, date: e.date, item: e.item, amount: e.amount, note: e.note, by: e.by || who() })));
      });
      ops.push(b => b.set(doc(db, 'settings', 'main'), {
        currency: state.currency, customItems: state.customItems, customIncomeItems: state.customIncomeItems,
      }));
      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        ops.slice(i, i + 400).forEach(op => op(batch));
        await batch.commit();
      }
    },
  };
}
