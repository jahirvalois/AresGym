# Azure Blob Storage Integration for Animations

This file explains how to create a Storage Account, a container for animations, and how to connect securely from your backend to generate SAS URLs for uploads.

1) Create resource group and storage account

```bash
az group create -n AresGym-rg -l eastus
az storage account create -n aresgymstorage001 -g AresGym-rg -l eastus --sku Standard_LRS
```

2) Create container (private)

```bash
az storage container create --name animations --account-name aresgymstorage001 --public-access off
```

3) Set CORS only if frontend will directly talk to blob with SAS

```bash
az storage cors add --services b --account-name aresgymstorage001 --allowed-origins https://your-app-domain --allowed-methods GET,PUT,POST --allowed-headers '*' --exposed-headers '*' --max-age 3600
```

4) Provide credentials to backend (do NOT expose to frontend)

Set in your Function/App configuration or environment:
- `STORAGE_ACCOUNT_NAME` = aresgymstorage001
- `STORAGE_ACCOUNT_KEY` = <account-key-from-portal>
- `STORAGE_CONTAINER` = animations

Prefer using Managed Identity:
- If your backend runs in Azure (Functions / App Service), enable System Assigned Managed Identity and grant `Storage Blob Data Contributor` role on the storage account. Then use azure identity libraries instead of account key.

5) Backend flow (what we implemented)

- Endpoint `POST /api/cosmos/animations/sas` with `{ blobName }` → returns `uploadUrl` (SAS URL).
- Client uploads file directly to `uploadUrl` with `PUT` and header `x-ms-blob-type: BlockBlob`.
- Client calls `POST /api/cosmos/animations/register` with `{ exerciseId, blobName, type }` to save metadata in Cosmos DB.

6) Security notes

- SAS tokens should be short-lived and limited to specific blob names and permissions.
- Do not generate SAS in the browser; always call backend that has storage credentials or uses managed identity.

7) Example Node.js snippet to generate SAS (server-side)

```js
const { StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');
const credential = new StorageSharedKeyCredential(accountName, accountKey);
const sas = generateBlobSASQueryParameters({ containerName, blobName, permissions: BlobSASPermissions.parse('cw'), startsOn: new Date(), expiresOn: new Date(Date.now()+3600*1000) }, credential).toString();
const url = `https://${accountName}.blob.core.windows.net/${containerName}/${encodeURIComponent(blobName)}?${sas}`;
```
