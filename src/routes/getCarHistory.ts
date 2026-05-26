import type { Request, Response } from "express";
import Groq from "groq-sdk";
import * as cheerio from "cheerio";

const groq = new Groq();

interface RequestQuery {
    vin: string;
}

export async function getCarHistory(
    req: Request<{}, {}, {}, RequestQuery>,
    res: Response,
) {
    const { vin } = req.query;

    console.log(`[getCarHistory] Request received for VIN: ${vin}`);

    if (!vin) {
        console.warn(`[getCarHistory] Request failed: VIN is required`);
        return res.status(400).send("VIN is required");
    }

    try {
        console.log(`[getCarHistory] Fetching verification token and cookies...`);
        const { token, cookies } = await getRequestVerificationToken();
        
        let searchHtml = "";
        let retries = 0;
        const maxRetries = 10;

        while (retries < maxRetries) {
            console.log(`[getCarHistory] Attempt ${retries + 1}/${maxRetries} to fetch and solve captcha...`);
            const captcha = await fetchNewCaptcha(cookies);
            const text = await solveCaptcha(captcha);

            console.log(`[getCarHistory] Submitting search with captcha text: "${text}"`);
            searchHtml = await performSearch(vin as string, token, text, cookies);
            
            const $ = cheerio.load(searchHtml);
            if ($('#inspectionTable').length === 0) {
                console.log(`[getCarHistory] Captcha failed or invalid response, retrying... (${retries + 1}/${maxRetries})`);
                retries++;
                continue;
            }
            
            console.log(`[getCarHistory] Successfully retrieved inspection table HTML for VIN: ${vin}`);
            break; // Success
        }

        if (retries === maxRetries) {
            console.error(`[getCarHistory] Failed to solve captcha after ${maxRetries} attempts for VIN: ${vin}`);
            return res.status(500).send("Failed to solve captcha after multiple attempts");
        }
        
        console.log(`[getCarHistory] Parsing inspection data...`);
        const parsedData = parseCarHistoryHtml(searchHtml);

        console.log(`[getCarHistory] Successfully processed request for VIN: ${vin}. Returning ${parsedData.length} records.`);
        res.json(parsedData);
    } catch (error) {
        console.error(`[getCarHistory] Error fetching car history for VIN: ${vin}`, error);
        res.status(500).send("Internal Server Error");
    }
}

async function getRequestVerificationToken(): Promise<{ token: string, cookies: string[] }> {
    console.log(`[getRequestVerificationToken] Fetching index page...`);
    const indexResponse = await fetch("https://www.kontrolatachometru.cz");
    const indexHtml = await indexResponse.text();

    const match = indexHtml.match(/<input\s+name="__RequestVerificationToken"\s+type="hidden"\s+value="([^"]+)"\s*\/>/);
    if (!match) {
        console.error(`[getRequestVerificationToken] Failed to extract __RequestVerificationToken`);
        throw new Error("Failed to extract __RequestVerificationToken");
    }

    const cookies = indexResponse.headers.getSetCookie ? indexResponse.headers.getSetCookie() : [];
    console.log(`[getRequestVerificationToken] Successfully extracted token and ${cookies.length} cookies.`);

    return { token: match[1] as string, cookies };
}

async function solveCaptcha(buffer: Buffer): Promise<string> {
    console.log(`[solveCaptcha] Sending captcha image (${buffer.length} bytes) to Groq Vision API...`);
    const base64Image = buffer.toString("base64");
    
    const chatCompletion = await groq.chat.completions.create({
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: "Read the text in this captcha image. Respond ONLY with the text shown in the image. No explanations, no markdown, just the text." },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/jpeg;base64,${base64Image}`,
                        },
                    },
                ],
            }
        ],
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        temperature: 0,
    });
    
    const result = chatCompletion.choices[0]?.message?.content || "";
    const cleanedResult = result.replace(/\s+/g, "");
    console.log(`[solveCaptcha] Groq API returned text: "${result}" -> Cleaned: "${cleanedResult}"`);
    return cleanedResult;
}

async function fetchNewCaptcha(cookies: string[]): Promise<Buffer> {
    console.log(`[fetchNewCaptcha] Requesting new captcha partial...`);
    const cookieHeader = cookies.map(c => c.split(';')[0]).join("; ");
    const response = await fetch("https://www.kontrolatachometru.cz/Home/CaptchaPartial", {
        "headers": {
            "accept": "text/html, */*; q=0.01",
            "accept-language": "cs;q=0.6",
            "cache-control": "no-cache",
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "pragma": "no-cache",
            "sec-ch-ua": "\"Chromium\";v=\"148\", \"Brave\";v=\"148\", \"Not/A)Brand\";v=\"99\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"macOS\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "sec-gpc": "1",
            "x-requested-with": "XMLHttpRequest",
            "cookie": cookieHeader
        },
        "referrer": "https://www.kontrolatachometru.cz/Home/Search",
        "body": "DXCallbackName=captcha&DXCallbackArgument=c0%3AR",
        "method": "POST",
    });

    const data = await response.text();

    const match = data.trim().match(/^\/\*DX\*\/\((.*)\)$/s);
    if(!match) {
        console.error(`[fetchNewCaptcha] Failed to match DX callback in response`);
        throw new Error("Failed to fetch new captcha");
    }

    const jsonStr = match[1]!.replace(/'/g, '"');
    const json = JSON.parse(jsonStr) as { result: string, id: number };

    console.log(`[fetchNewCaptcha] Fetching captcha image from: ${json.result}`);
    const imageResponse = await fetch(`https://www.kontrolatachometru.cz${json.result}`, {
        headers: {
            "cookie": cookieHeader
        }
    });

    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log(`[fetchNewCaptcha] Successfully fetched captcha image (${buffer.length} bytes)`);

    return buffer;
}

async function performSearch(vin: string, token: string, captchaText: string, cookies: string[]) {
    console.log(`[performSearch] Submitting search form for VIN: ${vin}...`);
    const formData = new FormData();
    formData.append("__RequestVerificationToken", token);
    formData.append("VIN", vin);
    formData.append("captcha$TB", captchaText);
    formData.append("captcha$TB$CVS", "");
    formData.append("DXScript", "1_171,1_94,1_164,1_91,1_148,1_90,1_159,1_114,1_121,1_117,1_98,1_125,17_33,1_105,17_0,1_120,1_106,17_1,1_156,1_154,1_107,17_3,1_108,1_113,1_109,1_110,1_112,1_122,17_5,1_116,1_145,1_119,17_18,17_19,1_118,1_157,17_29,1_123");
    formData.append("DXCss", "0_695,1_12,1_5,0_697,0_859,0_863,1_10,/Plugins/bootstrap/css/bootstrap.css,/Plugins/AdminLTE/css/AdminLTE.css,/Plugins/AdminLTE/css/skins/skin-blue-light.css,/Plugins/dataTables/css/dataTables.bootstrap.css,/Plugins/dataTables/Extensions/Responsive/css/responsive.bootstrap.css,/Plugins/font-awesome/css/font-awesome.css,/Plugins/JquerySpinner/css/preloader.css,/Content/site.css");
    formData.append("DXMVCEditorsValues", JSON.stringify({ "captcha_TB": captchaText }));

    const cookieHeader = cookies.map(c => c.split(';')[0]).join("; ");

    const response = await fetch("https://www.kontrolatachometru.cz/Home/Search", {
        method: "POST",
        headers: {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "accept-language": "cs;q=0.6",
            "cache-control": "no-cache",
            "pragma": "no-cache",
            "sec-ch-ua": "\"Chromium\";v=\"148\", \"Brave\";v=\"148\", \"Not/A)Brand\";v=\"99\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"macOS\"",
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "same-origin",
            "sec-fetch-user": "?1",
            "sec-gpc": "1",
            "upgrade-insecure-requests": "1",
            "cookie": cookieHeader,
            "referrer": "https://www.kontrolatachometru.cz/Home/Search",
        },
        body: formData as any,
    });

    const responseText = await response.text();
    console.log(`[performSearch] Search request completed, response length: ${responseText.length} chars`);
    return responseText;
}

function parseCarHistoryHtml(html: string) {
    console.log(`[parseCarHistoryHtml] Parsing HTML for inspection data...`);
    const $ = cheerio.load(html);
    const inspections: any[] = [];

    $('#inspectionTable tbody tr').each((_, el) => {
        const $row = $(el);
        const tds = $row.find('td');
        
        if (tds.length === 0) return; // Skip if no data columns

        inspections.push({
            rowId: $row.attr('data-row-id') || "",
            registrationCertificateNo: $row.attr('data-registration-certificate-no') || "",
            vehicleCategoryName: $row.attr('data-vehicle-category-name') || "",
            vehicleTypeName: $row.attr('data-vehicle-type-name') || "",
            vehicleMarkTypeName: $row.attr('data-vehicle-mark-type-name') || "",
            vehicleMarkName: $row.attr('data-vehicle-mark-name') || "",
            registrationDate: $row.attr('data-registration-date') || "",
            engineType: $row.attr('data-engine-type') || "",
            inspectionResultRateName: $row.attr('data-inspection-result-rate-name') || "",
            beginDate: $row.attr('data-begin-date') || "",
            defects: $row.attr('data-defects') || "",
            
            date: tds.eq(0).text().trim(),
            inspection: tds.eq(1).text().trim(),
            protocolNumber: tds.eq(2).text().trim(),
            inspectionType: tds.eq(3).text().trim(),
            mileage: tds.eq(4).text().trim(),
            note: tds.eq(5).text().trim()
        });
    });

    console.log(`[parseCarHistoryHtml] Found ${inspections.length} inspection records.`);
    return inspections;
}
