import { ManhwaRead } from "./ManhwaRead";

function testBase64Decoder() {
    console.log("\n=== TESTING CUSTOM BASE64 DECODER ===");

    const testString = "Hello, World!";
    const base64 = Buffer.from(testString).toString("base64");
    console.log("Original:", testString);
    console.log("Base64:", base64);

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    let output = "";
    let b64 = base64.replace(/[^A-Za-z0-9\+\/\=]/g, "");

    for (let i = 0; i < b64.length; i += 4) {
        const enc1 = chars.indexOf(b64.charAt(i));
        const enc2 = chars.indexOf(b64.charAt(i + 1));
        const enc3 = chars.indexOf(b64.charAt(i + 2));
        const enc4 = chars.indexOf(b64.charAt(i + 3));

        const chr1 = (enc1 << 2) | (enc2 >> 4);
        const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        const chr3 = ((enc3 & 3) << 6) | enc4;

        output += String.fromCharCode(chr1);

        if (enc3 !== 64) {
            output += String.fromCharCode(chr2);
        }
        if (enc4 !== 64) {
            output += String.fromCharCode(chr3);
        }
    }

    console.log("Decoded:", output);
    console.log("Match:", output === testString ? "✓" : "✗");
}

const args = process.argv.slice(2);
const testMangaId = args[0] || "someone-stop-her";
const testChapterId = args[1] || "01";

(global as any).App = {
    createRequestManager: (_config: any) => ({
        schedule: async (request: any, _priority: number) => {
            console.log("\n=== REQUEST ===");
            console.log("URL:", request.url);
            console.log("Method:", request.method);
            console.log("Headers:", JSON.stringify(request.headers, null, 2));
            if (request.data) {
                console.log("Data:", request.data);
            }

            const fetchOptions: RequestInit = {
                method: request.method,
                headers: request.headers,
            };

            if (request.data && request.method === "POST") {
                fetchOptions.body = request.data;
            }

            const response = await fetch(request.url, fetchOptions);
            const data = await response.text();

            console.log("\n=== RESPONSE ===");
            console.log("Status:", response.status);
            console.log("Headers:", JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
            console.log("Data length:", data.length);

            return { data };
        },
        getDefaultUserAgent: async () =>
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }),
    createRequest: (request: any) => request,
    createChapterDetails: (details: any) => details,
    createSourceManga: (manga: any) => manga,
    createMangaInfo: (info: any) => info,
};

async function testGetMangaDetails() {
    console.log("\n========================================");
    console.log("TEST: getMangaDetails");
    console.log("========================================");

    const source = new ManhwaRead();

    try {
        const result = await source.getMangaDetails(testMangaId);
        console.log("\n=== RESULT ===");
        console.log("Title:", result.mangaInfo.titles);
        console.log("Image URL:", result.mangaInfo.image);
        console.log("Description:", result.mangaInfo.desc?.substring(0, 100) + "...");
        console.log("Status:", result.mangaInfo.status);
        console.log("Author:", result.mangaInfo.author);
        console.log("Artist:", result.mangaInfo.artist);

        console.log("\n=== TESTING COVER IMAGE EXTRACTION ===");
        await testCoverImageExtraction(testMangaId, result.mangaInfo.titles[0]);

        console.log("\n=== TESTING COVER IMAGE URL ===");
        await testImageUrl(result.mangaInfo.image);

        return result;
    } catch (error) {
        console.error("ERROR:", error);
        throw error;
    }
}

async function testGetChapterDetails() {
    console.log("\n========================================");
    console.log("TEST: getChapterDetails");
    console.log("========================================");

    const source = new ManhwaRead();

    try {
        const result = await source.getChapterDetails(testMangaId, testChapterId);
        console.log("\n=== RESULT ===");
        console.log("Chapter ID:", result.id);
        console.log("Manga ID:", result.mangaId);
        console.log("Number of pages:", result.pages.length);
        console.log("\nFirst 3 page URLs:");
        result.pages.slice(0, 3).forEach((url, idx) => {
            console.log(`  Page ${idx + 1}:`, url);
        });

        if (result.pages.length > 0) {
            console.log("\n=== TESTING FIRST PAGE IMAGE ===");
            await testImageUrl(result.pages[0]);

            console.log("\n=== TESTING WITH CHAPTER-SPECIFIC REFERER ===");
            await testImageUrl(
                result.pages[0],
                `https://manhwaread.com/manhwa/${testMangaId}/chapter-${testChapterId}/`
            );
        }

        return result;
    } catch (error) {
        console.error("ERROR:", error);
        throw error;
    }
}

async function testCoverImageExtraction(mangaId: string, title: string) {
    console.log("Fetching manga page to test cover image selectors...");

    const url = `https://manhwaread.com/manhwa/${mangaId}/`;
    const response = await fetch(url, {
        headers: {
            "user-agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
    });

    const html = await response.text();

    const cheerio = await import("cheerio");
    const $ = cheerio.load(html);

    console.log("\nTesting selector 1: img[alt='" + title + "']");
    const selector1 = $("img[alt='" + title + "']").attr("src");
    console.log("  Result:", selector1 || "(not found)");

    console.log("\nTesting selector 2: div.flex.justify-center img");
    const selector2 = $("div.flex.justify-center img").first().attr("src");
    console.log("  Result:", selector2 || "(not found)");

    console.log("\nAll images found on page:");
    $("img").each((idx, elem) => {
        const src = $(elem).attr("src");
        const alt = $(elem).attr("alt");
        const classes = $(elem).attr("class");
        if (idx < 5) {
            console.log(`  ${idx + 1}. src="${src?.substring(0, 60)}..." alt="${alt}" class="${classes}"`);
        }
    });

    const finalImage = selector1 || selector2 || "";
    console.log("\nFinal selected image:", finalImage);
}

async function testImageUrl(imageUrl: string, referer?: string) {
    console.log("Testing URL:", imageUrl);

    const headers: Record<string, string> = {
        referer: referer || "https://manhwaread.com",
        "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        accept: "image/webp,image/apng,image/*,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.5",
    };

    console.log("Headers:", JSON.stringify(headers, null, 2));

    try {
        const response = await fetch(imageUrl, { headers });
        console.log("Status:", response.status);
        console.log("Content-Type:", response.headers.get("content-type"));
        console.log("Content-Length:", response.headers.get("content-length"));

        if (response.status === 200) {
            console.log("✓ Image is accessible!");
        } else {
            console.log("✗ Image request failed with status:", response.status);
            const text = await response.text();
            console.log("Response body:", text.substring(0, 500));
        }
    } catch (error) {
        console.error("✗ Failed to fetch image:", error);
    }
}

// Run tests
async function runTests() {
    try {
        console.log("Starting ManhwaRead tests...\n");
        console.log(`Using Manga ID: ${testMangaId}`);
        console.log(`Using Chapter ID: ${testChapterId}\n`);

        // Test 0: Test base64 decoder
        testBase64Decoder();

        // Test 1: Get manga details
        await testGetMangaDetails();

        // Test 2: Get chapter details
        await testGetChapterDetails();

        console.log("\n========================================");
        console.log("All tests completed!");
        console.log("========================================");
        console.log("\nTo test with different manga/chapter:");
        console.log("  tsx src/ManhwaRead/ManhwaRead.test.ts <mangaId> <chapterId>");
    } catch (error) {
        console.error("\nTest suite failed:", error);
        process.exit(1);
    }
}

runTests();
