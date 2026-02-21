
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectToDatabase } from "../lib/mongodb";

import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from "@azure/storage-blob";

const AZ_CONTAINER = process.env.AZURE_STORAGE_CONTAINER || 'exercise-media';
const AZ_CONN = process.env.AZURE_STORAGE_CONNECTION_STRING || '';

function parseConnectionString(conn: string) {
    // crude parse to extract accountName and accountKey when needed for SAS
    const parts = conn.split(';').reduce((acc: any, cur) => {
        const [k, v] = cur.split('=');
        if (k && v) acc[k] = v;
        return acc;
    }, {});
    return { accountName: parts.AccountName || parts.AccountName?.toLowerCase(), accountKey: parts.AccountKey };
}

export async function exercisesHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const { db } = await connectToDatabase();
    const path = request.url.split('/').pop();

    if (path === 'bank') {
        if (request.method === 'GET') {
            const data = await db.collection("config").findOne({ id: 'exerciseBank' });
            return { jsonBody: data?.content || {} };
        }
        if (request.method === 'PUT') {
            const body: any = await request.json();
            await db.collection("config").updateOne(
                { id: 'exerciseBank' },
                { $set: { [`content.${body.category}`]: body.exercises } },
                { upsert: true }
            );
            return { status: 200 };
        }
    }

    if (path === 'media') {
        if (request.method === 'GET') {
            const data = await db.collection("config").findOne({ id: 'exerciseMedia' });
            const content = data?.content || {};

            // If we have an Azure connection string, attempt to generate READ SAS URLs
            if (AZ_CONN) {
                try {
                    const { accountName, accountKey } = parseConnectionString(AZ_CONN);
                    if (accountName && accountKey) {
                        const creds = new StorageSharedKeyCredential(accountName, accountKey!);
                        const signed: Record<string, string> = {};
                        const now = new Date();
                        const expiresOn = new Date(Date.now() + (1000 * 60 * 15)); // 15 minutes

                        for (const [ex, url] of Object.entries(content as Record<string, string>)) {
                            try {
                                if (!url) { signed[ex] = ''; continue; }
                                // If URL already has query params assume it's signed
                                if (url.indexOf('?') >= 0) { signed[ex] = url; continue; }

                                const parsed = new URL(url);
                                // path looks like /<container>/<blobName>
                                const pathParts = parsed.pathname.split('/').filter(Boolean);
                                // ensure container matches expected container
                                const container = pathParts[0];
                                const blobName = pathParts.slice(1).join('/');
                                if (!blobName) { signed[ex] = url; continue; }

                                const sas = generateBlobSASQueryParameters({
                                    containerName: container,
                                    blobName,
                                    permissions: BlobSASPermissions.parse('r'),
                                    startsOn: now,
                                    expiresOn
                                }, creds).toString();

                                signed[ex] = `${url}?${sas}`;
                            } catch (e) {
                                signed[ex] = (content as any)[ex];
                            }
                        }

                        return { jsonBody: signed };
                    }
                } catch (e) {
                    // fallthrough to return raw content
                }
            }

            return { jsonBody: content };
        }
        if (request.method === 'PUT') {
            const body: any = await request.json();
            await db.collection("config").updateOne(
                { id: 'exerciseMedia' },
                { $set: { [`content.${body.exerciseName}`]: body.url } },
                { upsert: true }
            );
            return { status: 200 };
        }
    }

    // (upload-base64 endpoint removed; using SAS-only uploads)

    if (path === 'sas') {
        // Generate a SAS PUT URL for direct client upload
        if (request.method === 'GET') {
            try {
                const query = new URL(request.url).searchParams;
                const filename = query.get('filename') || `${Date.now()}`;
                if (!AZ_CONN) return { status: 500, jsonBody: { error: 'MISSING_AZ_CONN' } };

                const { accountName, accountKey } = parseConnectionString(AZ_CONN);
                if (!accountName || !accountKey) return { status: 500, jsonBody: { error: 'INVALID_CONN' } };

                const creds = new StorageSharedKeyCredential(accountName, accountKey!);
                const blobName = `${Date.now()}-${filename}`.replace(/\s+/g, '_');
                const startsOn = new Date();
                const expiresOn = new Date(Date.now() + (1000 * 60 * 60)); // 1 hour

                const sas = generateBlobSASQueryParameters({
                    containerName: AZ_CONTAINER,
                    blobName,
                    permissions: BlobSASPermissions.parse('cw'),
                    startsOn,
                    expiresOn
                }, creds).toString();

                const uploadUrl = `https://${accountName}.blob.core.windows.net/${AZ_CONTAINER}/${blobName}?${sas}`;
                const blobUrl = `https://${accountName}.blob.core.windows.net/${AZ_CONTAINER}/${blobName}`;

                return { status: 200, jsonBody: { uploadUrl, blobUrl, expiresOn: expiresOn.toISOString() } };
            } catch (err: any) {
                return { status: 500, jsonBody: { error: err?.message || 'SAS_FAILED' } };
            }
        }
    }

    return { status: 404 };
}

app.http('exercisesBank', {
    methods: ['GET', 'PUT'],
    route: 'exercises/bank',
    authLevel: 'anonymous',
    handler: exercisesHandler
});

app.http('exercisesMedia', {
    methods: ['GET', 'PUT'],
    route: 'exercises/media',
    authLevel: 'anonymous',
    handler: exercisesHandler
});

// upload-base64 route removed; SAS route remains below

app.http('exercisesSas', {
    methods: ['GET'],
    route: 'exercises/sas',
    authLevel: 'anonymous',
    handler: exercisesHandler
});
