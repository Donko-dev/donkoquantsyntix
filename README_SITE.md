# DONKO SYNTIX : site

Site statique en lecture seule pour le robot DONKO SYNTIX (indices SyntX, Weltrade).
Déployable sur GitHub Pages, sans serveur. Il affiche les résultats que le robot publie
via son API sur le VPS.

## Ce que fait le site

- Tableau de bord : trades clôturés, résultat net, taux de gains, profit factor, drawdown,
  positions ouvertes. Chiffres du passé uniquement.
- Journal des trades et positions ouvertes, lus depuis l'API du VPS.
- Méthode du robot, écrite et lisible.
- Heures de trading Weltrade et liens vers les pages officielles Weltrade.
- Alertes : événements nouveaux détectés pendant la session ouverte.
- Thème clair ou sombre, langue français, anglais ou allemand, devise d'affichage
  USD, EUR, FCFA (XOF) ou FCFA (XAF).
- Avertissement de risque affiché sous le logo et dans le pied de page, dans les trois langues.

## Ce que le site ne fait pas (et ne fera pas depuis GitHub Pages)

- Il n'envoie aucun ordre et ne modifie aucun réglage du robot.
- Il ne connecte aucun compte MT5. Aucun mot de passe de compte n'est accepté ici.
- Il n'affiche pas de flux d'actualités en direct : les liens renvoient vers les pages Weltrade.

Les actions (activer ou désactiver le robot, couper une position, changer un lot, changer la
devise de trade) demandent une API d'écriture authentifiée sur le VPS. Elles ne sont pas
construites. Elles ne seront ajoutées qu'avec une authentification forte.

## Mise en ligne sur GitHub Pages

1. Créer un dépôt GitHub, par exemple `donko-syntix`.
2. Pousser le **contenu** de ce dossier à la racine du dépôt (tous les fichiers, à plat, sans sous-dossier).
   Ne jamais pousser de jeton, de mot de passe ou de configuration réelle.
3. Settings > Pages > Source : branche `main`, dossier `/ (root)`.
4. Le site est disponible à `https://<ton-compte>.github.io/donko-syntix/`.

## Connexion à l'API du VPS

Le site appelle l'API en HTTPS avec un jeton. Sur le VPS, dans la configuration de l'API :

- `TZ_ALLOWED_ORIGINS=https://<ton-compte>.github.io` (exactement, sans barre oblique finale) ;
- `TZ_API_TOKEN` : jeton d'au moins 32 caractères, généré avec le module `secrets` ;
- `TZ_PATH_SYNTIX` : dossier du robot SYNTIX (qui contient `logs/journal.jsonl`).

Dans le site, Réglages : adresse HTTPS de l'API et jeton. Ils restent dans ton navigateur.

L'API doit être exposée en HTTPS via un reverse proxy (voir DEPLOIEMENT). Sans HTTPS, le
navigateur bloque l'appel, et le site l'indique.

## Hostinger

Hostinger peut héberger ces fichiers statiques. En revanche, l'API qui fait tourner le
robot et lit son journal doit rester sur le VPS : l'hébergement partagé ne fait pas
tourner de programme Python en continu. Le site sur Hostinger appellera donc la même API du VPS.

## Vérification

Test navigateur réalisé sur ordinateur et sur téléphone, contre l'API réelle et un journal
de test : 26 contrôles réussis (langues, thème, devise, liens Weltrade, absence de bouton
d'ordre, requêtes en GET uniquement, aucune erreur JavaScript, pas de débordement sur téléphone).
