# 🌐 Headscale WebUI

Interface d'administration web complète pour serveur [Headscale](https://github.com/juanfont/headscale), sécurisée par authentification login/mot de passe.

![Dark Mode](https://img.shields.io/badge/theme-dark%20%2F%20light-blue)
![Node.js](https://img.shields.io/badge/backend-Node.js-green)
![Docker](https://img.shields.io/badge/docker-ready-blue)

---

## ✨ Fonctionnalités

### 📡 Page Nodes
- Liste des nodes avec : ID, Nom, User, IP, Statut (online/offline), Dernière connexion
- Suppression de node avec confirmation
- Rafraîchissement en temps réel

### ➕ Ajouter un Node
- Sélection du user Headscale
- Génération de clé de pré-authentification
- Génération automatique de la commande `tailscale up`
- Bouton copier la commande

### 👥 Users & Clés
- Liste des users Headscale
- Clés de pré-authentification par user (statut, expiration, type)
- Création de nouveaux users

### 🖥️ Shell sécurisé
- Terminal intégré dans le navigateur
- **Uniquement les commandes `headscale`** autorisées
- Historique des commandes (flèches haut/bas)
- Protection contre les commandes système dangereuses

### 📋 Journal d'audit
- Logs de toutes les actions (connexions, suppressions, créations...)

### ⚙️ Paramètres
- **Dark mode / Light mode**
- Changement de mot de passe
- Gestion des utilisateurs WebUI (admin / lecture seule)

---

## 🚀 Installation

### Prérequis
- **Node.js** 18+ (ou Docker)
- **Headscale** installé et accessible depuis le serveur

### Installation locale

```bash
# Cloner le projet
cd WebUIheadscale

# Installer les dépendances
npm install

# Lancer le serveur
npm start
```

L'interface est accessible sur **http://localhost:3000**

Identifiants par défaut : `admin` / `admin`

### Installation Docker

```bash
# Build et lancement
docker compose up -d

# Ou avec docker build
docker build -t headscale-webui .
docker run -d -p 3000:3000 --name headscale-webui headscale-webui
```

---

## ⚙️ Configuration

Toutes les options sont configurables via variables d'environnement ou dans `config.js` :

| Variable | Description | Défaut |
|---|---|---|
| `PORT` | Port du serveur web | `3000` |
| `HEADSCALE_URL` | URL du serveur Headscale | `https://headscale.example.com` |
| `HEADSCALE_BIN` | Chemin du binaire headscale | `headscale` |
| `SESSION_SECRET` | Secret de session (changer en production !) | `headscale-webui-secret...` |
| `ADMIN_USER` | Nom d'utilisateur admin par défaut | `admin` |
| `ADMIN_PASS` | Mot de passe admin par défaut | `admin` |
| `DB_PATH` | Chemin de la base de données SQLite | `./data/headscale-webui.db` |

---

## 🔒 Sécurité

- ✅ Authentification obligatoire par session
- ✅ Mots de passe hashés avec bcrypt
- ✅ Shell restreint aux commandes `headscale` uniquement
- ✅ Sanitisation des arguments (pas d'injection shell)
- ✅ Session HTTPOnly + SameSite strict
- ✅ Rôles : `admin` (accès complet) / `readonly` (consultation uniquement)
- ✅ Journal d'audit de toutes les actions

---

## 📁 Structure du projet

```
WebUIheadscale/
├── server.js          # Point d'entrée Express
├── config.js          # Configuration
├── db.js              # Base de données SQLite (users, logs)
├── headscale.js       # Exécuteur de commandes Headscale
├── routes.js          # Routes API
├── package.json
├── Dockerfile
├── docker-compose.yml
└── public/
    ├── index.html     # Interface SPA
    ├── css/
    │   └── style.css  # Styles (dark/light theme)
    └── js/
        ├── api.js     # Client API
        └── app.js     # Logique frontend
```

---

## ⚠️ Notes importantes

1. **Changez le mot de passe admin** dès la première connexion
2. **Changez le `SESSION_SECRET`** en production
3. Le binaire `headscale` doit être accessible depuis le serveur WebUI
4. En mode Docker, montez le binaire headscale ou utilisez le même réseau que le conteneur Headscale

---

## 📝 Licence

MIT
