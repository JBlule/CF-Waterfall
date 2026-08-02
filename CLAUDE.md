# CLAUDE.md — Cascade de cash-flows (mini-jeu MONIAC)

## But du projet
Mini-jeu qui visualise une **cascade de cash-flows d'entreprise** façon machine MONIAC : le cash entre en haut (revenus) et s'écoule à travers des compartiments reliés par des tuyaux animés, selon un ordre de priorité de paiement (priority of payments) avec comptes de réserve et covenants.

C'est un projet de certification vibe-coding. Objectif : prouver qu'on peut livrer une app **correcte à 100%** sans compétence préalable en code web. L'exactitude prime sur tout le reste.

## Stack (100% gratuite, aucun backend)
- **V1 : HTML / CSS / JavaScript pur.** Pas de framework.
- Rendu : **SVG** pour les compartiments, tuyaux et animations de flux.
- Animations : CSS (`stroke-dasharray` défilant pour les tuyaux, transitions sur les niveaux). Pas de moteur physique.
- React envisagé **seulement** après une V1 fonctionnelle, si en avance. Ne pas introduire React sans validation explicite.

## Contrainte absolue
**Aucune IA à l'exécution.** Tout le rendu et tous les calculs sont déterministes. L'IA n'intervient qu'en phase de développement (Claude Code). Aucun appel réseau, aucune dépendance runtime externe.

## Architecture : trois couches strictement séparées
1. **Données** — définition de la cascade (compartiments, liens, priorités) + inputs du joueur (curseurs/UI). Valeurs codées en dur ou saisies via l'UI.
2. **Moteur de cascade** — fonction(s) **pure(s)** : `état d'entrée → état de sortie`, sans effet de bord, sans toucher au DOM. C'est le cœur métier. Doit être testable seul.
3. **Rendu** — dessine l'état produit par le moteur (SVG + animations). Un seul point d'entrée : `dessiner(état)`.

Règle : le moteur ne connaît pas l'affichage ; le rendu ne calcule rien. Toute la logique financière vit dans la couche 2.

## Topologie : superset figé
- Tous les compartiments possibles sont **définis en dur**, avec un **placement calculé une fois à la main** (pas de layout automatique).
- Compartiments possibles : revenus opérationnels, revenus additionnels (ex. PV), OPEX, service de la dette, comptes de réserve (DSRA, MRA…), Lock-up Account, impôts, distribution, cash carried/brought forward.
- Chaque compartiment porte : sa position (figée), un flag **actif/inactif** (par scénario), une **période d'activation** (à partir de quand il entre en jeu).
- Un compartiment non déclenché reste à 0 / estompé (ex. Lock-up si le trigger n'est jamais atteint). Un compartiment qui "apparaît" en période N (ex. revenus PV) existe dès le départ mais s'active à N.
- La **vraie** topologie dynamique (créer/insérer un compartiment et recalculer le placement) est **hors périmètre V1**.

## Itérations multi-périodes
Le cash restant en fin de période N alimente `cash carried forward`, reversé dans `cash brought forward` au début de la période N+1.

## Mécanique de jeu
- Curseurs / UI au-dessus de l'illustration pour saisir les inputs du modèle.
- Covenants qui **redirigent ou bloquent** le cash selon des seuils (ex. DSCR sous le seuil → distribution bloquée, cash trappé vers réserves / remboursement).
- Comptes de réserve à alimenter jusqu'à une cible avant de laisser passer le cash en aval.
- Mode multi-périodes avec objectif (ex. maintenir un ratio au-dessus d'un seuil) et condition d'échec.

## Rôle de l'Excel (à ne pas confondre)
L'Excel a **exactement deux rôles**, rien de plus :
1. **Spécification** — référence de conception pour comprendre les liens entre compartiments et les règles, pendant le dev.
2. **Oracle de test** — pour un scénario donné, fournit les résultats attendus (compartiment × période) auxquels on compare l'app.

L'Excel **n'est pas** un input runtime : l'app ne le lit pas, ne le parse pas, ne le charge pas. **Aucune librairie de parsing Excel.** L'app est autonome.

## Tests (preuve du « 100% »)
- Le moteur de cascade (couche 2) est testé de façon exhaustive, fonction par fonction.
- Les résultats attendus proviennent de l'Excel de référence, figés comme cas de test dans le code.
- Comparaison à un epsilon près (tolérance sur les arrondis flottants).
- Chaque règle (priorité de paiement, covenant, réserve, report de cash) a son test dédié.

## Conventions
- Code et commentaires clairs : l'auteur doit pouvoir **expliquer chaque ligne** (critère de certification).
- Nommer les compartiments et règles avec le vocabulaire financier réel (DSRA, DSCR, lock-up, priority of payments).
- Arrondir toute valeur affichée (éviter les artefacts de flottants).
- Sentence case dans l'UI, pas de jargon technique inutile côté joueur.
