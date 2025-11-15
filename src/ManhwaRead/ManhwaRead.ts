import {
    ChapterProviding,
    ContentRating,
    HomePageSectionsProviding,
    MangaProviding,
    PagedResults,
    Request,
    Response,
    SearchRequest,
    SearchResultsProviding,
    SourceInfo,
    SourceIntents,
    SourceManga,
    ChapterDetails,
    Chapter,
    HomeSection,
    TagSection,
    PartialSourceManga,
    BadgeColor,
} from "@paperback/types";

import * as cheerio from "cheerio";

const DOMAIN = "https://manhwaread.com";

export const ManhwaReadInfo: SourceInfo = {
    version: "1.0.0",
    name: "ManhwaRead",
    description: `Extension that pulls manga from ${DOMAIN}`,
    author: "Nibysukces",
    icon: "icon.png",
    contentRating: ContentRating.ADULT,
    websiteBaseURL: DOMAIN,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS,
    sourceTags: [
        {
            text: "18+",
            type: BadgeColor.BLUE,
        },
    ],
};

function base64Decode(base64: string): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let output = "";

    base64 = base64.replace(/[^A-Za-z0-9\+\/]/g, "");

    for (let i = 0; i < base64.length; i += 4) {
        const enc1 = chars.indexOf(base64.charAt(i));
        const enc2 = chars.indexOf(base64.charAt(i + 1));
        const enc3 = chars.indexOf(base64.charAt(i + 2));
        const enc4 = chars.indexOf(base64.charAt(i + 3));

        const chr1 = (enc1 << 2) | (enc2 >> 4);
        const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        const chr3 = ((enc3 & 3) << 6) | enc4;

        output += String.fromCharCode(chr1);

        if (enc3 !== -1 && i + 2 < base64.length) {
            output += String.fromCharCode(chr2);
        }
        if (enc4 !== -1 && i + 3 < base64.length) {
            output += String.fromCharCode(chr3);
        }
    }

    return output;
}

export class ManhwaRead implements ChapterProviding, HomePageSectionsProviding, MangaProviding, SearchResultsProviding {
    requestManager = App.createRequestManager({
        requestsPerSecond: 5,
        requestTimeout: 10000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                request.headers = {
                    ...(request.headers ?? {}),
                    ...{
                        referer: DOMAIN,
                        "user-agent": await this.requestManager.getDefaultUserAgent(),
                        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                        "accept-language": "en-US,en;q=0.5",
                        "accept-encoding": "gzip, deflate, br",
                    },
                };

                request.url = request.url.replace(/^http:/, "https:");

                return request;
            },

            interceptResponse: async (response: Response): Promise<Response> => {
                return response;
            },
        },
    });

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1;

        if (page > 1) {
            return App.createPagedResults({
                results: [],
                metadata: undefined,
            });
        }

        if (!query.title) {
            const request = App.createRequest({
                url: DOMAIN,
                method: "GET",
            });

            const response = await this.requestManager.schedule(request, 1);
            const $ = cheerio.load(response.data as string);

            const items: PartialSourceManga[] = [];

            const popularSection = $('span.text-secondary:contains("Popular")').closest("section");

            if (popularSection.length === 0) {
                return App.createPagedResults({
                    results: items,
                    metadata: undefined,
                });
            }

            popularSection.find(".manga-item").each((_, element) => {
                const $elem = $(element);

                const title = $elem.find("h3 .manga-item__link").text().trim();
                const mangaUrl = $elem.find("h3 .manga-item__link").attr("href") || "";
                const mangaId = mangaUrl.split("/manhwa/")[1]?.replace(/\/$/, "");

                if (!mangaId || !title) return;

                const imageUrl = $elem.find(".manga-item__img-inner").attr("src") || "";
                const rating = $elem.find(".manga-item__rating span.text-sm").text().trim();
                const status = $elem.find(".manga-status__label").text().trim();
                const subtitle = rating ? `${rating} • ${status}` : status;

                items.push(
                    App.createPartialSourceManga({
                        mangaId,
                        image: imageUrl,
                        title,
                        subtitle,
                    })
                );
            });

            return App.createPagedResults({
                results: items,
                metadata: undefined,
            });
        }

        let searchUrl = `${DOMAIN}/wp-admin/admin-ajax.php`;

        const request = App.createRequest({
            url: searchUrl,
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data: `action=quick_search&keyword=${encodeURIComponent(query.title)}`,
        });

        const response = await this.requestManager.schedule(request, 1);

        let htmlContent = "";
        try {
            const jsonData = JSON.parse(response.data as string);
            if (jsonData.success && jsonData.data?.searchMangaResults) {
                htmlContent = jsonData.data.searchMangaResults;
            }
        } catch (error) {
            return App.createPagedResults({
                results: [],
                metadata: undefined,
            });
        }

        const $ = cheerio.load(htmlContent);
        const items: PartialSourceManga[] = [];

        $(".manga-item").each((_, element) => {
            const $elem = $(element);

            const mangaUrl = $elem.find(".manga-item__link").attr("href");
            if (!mangaUrl) return;

            const mangaId = mangaUrl.split("/manhwa/")[1]?.replace(/\/$/, "");
            if (!mangaId) return;

            const title = $elem.find(".manga-item__link").text().trim();
            const imageUrl = $elem.find(".manga-item__img-inner").attr("src") || "";

            const rating = $elem.find(".manga-item__rating span.text-sm").text().trim();
            const status = $elem.find(".manga-status__label").text().trim();
            const subtitle = rating ? `${rating} • ${status}` : status;

            items.push(
                App.createPartialSourceManga({
                    mangaId,
                    image: imageUrl,
                    title,
                    subtitle,
                })
            );
        });

        return App.createPagedResults({
            results: items,
            metadata: undefined,
        });
    }
    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const request = App.createRequest({
            url: DOMAIN,
            method: "GET",
        });

        const response = await this.requestManager.schedule(request, 1);
        const $ = cheerio.load(response.data as string);

        const popularSection = $('span.text-secondary:contains("Popular")').closest("section");

        if (popularSection.length > 0) {
            const popularItems: PartialSourceManga[] = [];

            popularSection.find(".manga-item").each((_, element) => {
                const $elem = $(element);

                const title = $elem.find("h3 .manga-item__link").text().trim();
                const mangaUrl = $elem.find("h3 .manga-item__link").attr("href") || "";
                const mangaId = mangaUrl.split("/manhwa/")[1]?.replace(/\/$/, "");

                if (!mangaId || !title) return;

                const imageUrl = $elem.find(".manga-item__img-inner").attr("src") || "";
                const rating = $elem.find(".manga-item__rating span.text-sm").text().trim();
                const status = $elem.find(".manga-status__label").text().trim();
                const subtitle = rating ? `${rating} • ${status}` : status;

                if (popularItems.length < 20) {
                    popularItems.push(
                        App.createPartialSourceManga({
                            mangaId,
                            image: imageUrl,
                            title,
                            subtitle,
                        })
                    );
                }
            });

            sectionCallback(
                App.createHomeSection({
                    id: "popular",
                    title: "Popular this Week",
                    type: "singleRowNormal",
                    items: popularItems,
                    containsMoreItems: false,
                })
            );
        }

        const newSection = $('a[href*="sortby=new"]').closest("section");

        if (newSection.length > 0) {
            const newItems: PartialSourceManga[] = [];

            newSection.find(".manga-item").each((_, element) => {
                const $elem = $(element);

                const title = $elem.find("h3 .manga-item__link").text().trim();
                const mangaUrl = $elem.find("h3 .manga-item__link").attr("href") || "";
                const mangaId = mangaUrl.split("/manhwa/")[1]?.replace(/\/$/, "");

                if (!mangaId || !title) return;

                const imageUrl = $elem.find(".manga-item__img-inner").attr("src") || "";
                const rating = $elem.find(".manga-item__rating span.text-sm").text().trim();
                const status = $elem.find(".manga-status__label").text().trim();
                const subtitle = rating ? `${rating} • ${status}` : status;

                if (newItems.length < 20) {
                    newItems.push(
                        App.createPartialSourceManga({
                            mangaId,
                            image: imageUrl,
                            title,
                            subtitle,
                        })
                    );
                }
            });

            sectionCallback(
                App.createHomeSection({
                    id: "new",
                    title: "New Releases",
                    type: "singleRowNormal",
                    items: newItems,
                    containsMoreItems: true,
                })
            );
        }

        const latestSection = $('span:contains("Latest")')
            .filter((_, el) => $(el).text().includes("Release"))
            .closest("section");

        if (latestSection.length > 0) {
            const latestItems: PartialSourceManga[] = [];

            latestSection.find(".manga-item").each((_, element) => {
                const $elem = $(element);

                const title = $elem.find("h3 .manga-item__link").text().trim();
                const mangaUrl = $elem.find("h3 .manga-item__link").attr("href") || "";
                const mangaId = mangaUrl.split("/manhwa/")[1]?.replace(/\/$/, "");

                if (!mangaId || !title) return;

                const imageUrl = $elem.find(".manga-item__img-inner").attr("src") || "";
                const rating = $elem.find(".manga-item__rating span.text-sm").text().trim();
                const status = $elem.find(".manga-status__label").text().trim();
                const subtitle = rating ? `${rating} • ${status}` : status;

                if (latestItems.length < 20) {
                    latestItems.push(
                        App.createPartialSourceManga({
                            mangaId,
                            image: imageUrl,
                            title,
                            subtitle,
                        })
                    );
                }
            });

            sectionCallback(
                App.createHomeSection({
                    id: "latest",
                    title: "Latest Release",
                    type: "singleRowNormal",
                    items: latestItems,
                    containsMoreItems: true,
                })
            );
        }
    }
    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1;
        const collectedIds: string[] = metadata?.collectedIds ?? [];

        let url: string;
        if (homepageSectionId === "new") {
            url = `${DOMAIN}/manhwa/?sortby=new&page=${page}`;
        } else if (homepageSectionId === "latest") {
            url = page > 1 ? `${DOMAIN}/manhwa/page/${page}/` : `${DOMAIN}/manhwa/`;
        } else {
            url = page > 1 ? `${DOMAIN}/manhwa/page/${page}/` : `${DOMAIN}/manhwa/`;
        }

        const request = App.createRequest({
            url: url,
            method: "GET",
        });

        const response = await this.requestManager.schedule(request, 1);
        const $ = cheerio.load(response.data as string);

        const items: PartialSourceManga[] = [];
        const newCollectedIds = [...collectedIds];

        $(".manga-item").each((_, element) => {
            const $elem = $(element);

            const title = $elem.find("h3 .manga-item__link").text().trim();
            const mangaUrl = $elem.find("h3 .manga-item__link").attr("href") || "";
            const mangaId = mangaUrl.split("/manhwa/")[1]?.replace(/\/$/, "");

            if (!mangaId || !title || newCollectedIds.includes(mangaId)) return;

            const imageUrl = $elem.find(".manga-item__img-inner").attr("src") || "";
            const rating = $elem.find(".manga-item__rating span.text-sm").text().trim();
            const status = $elem.find(".manga-status__label").text().trim();
            const subtitle = rating ? `${rating} • ${status}` : status;

            newCollectedIds.push(mangaId);
            items.push(
                App.createPartialSourceManga({
                    mangaId,
                    image: imageUrl,
                    title,
                    subtitle,
                })
            );
        });

        const hasNextPage =
            $(".wp-pagenavi .nextpostslink").length > 0 ||
            $(".wp-pagenavi a").filter((_, el) => {
                const pageNum = parseInt($(el).text());
                return !isNaN(pageNum) && pageNum > page;
            }).length > 0;

        return App.createPagedResults({
            results: items,
            metadata: hasNextPage
                ? {
                      page: page + 1,
                      collectedIds: newCollectedIds,
                  }
                : undefined,
        });
    }
    async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = App.createRequest({
            url: `${DOMAIN}/manhwa/${mangaId}`,
            method: "GET",
        });

        const response = await this.requestManager.schedule(request, 1);
        const $ = cheerio.load(response.data as string);

        const chapters: Chapter[] = [];

        $(".chapters-list .chapter-item").each((_, element) => {
            const $elem = $(element);

            const chapterUrl = $elem.attr("href");
            if (!chapterUrl) return;

            const chapterId = chapterUrl
                .split("/")
                .filter((part) => part.startsWith("chapter-"))[0]
                ?.replace("chapter-", "");

            if (!chapterId) return;

            const chapterName = $elem.find(".chapter-item__name").text().trim() || `Chapter ${chapterId}`;

            let chapNum = 0;
            const numMatch = chapterName.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
            if (numMatch && numMatch[1]) {
                chapNum = parseFloat(numMatch[1]);
            } else {
                const idMatch = chapterId.match(/(\d+(?:\.\d+)?)/);
                if (idMatch && idMatch[1]) {
                    chapNum = parseFloat(idMatch[1]);
                }
            }

            const dateText = $elem.find(".chapter-item__date").text().trim();
            let publishDate = new Date();

            if (dateText) {
                const dateMatch = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                if (dateMatch && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
                    const day = dateMatch[1];
                    const month = dateMatch[2];
                    const year = dateMatch[3];
                    publishDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                }
            }

            chapters.push(
                App.createChapter({
                    id: chapterId,
                    chapNum: chapNum,
                    name: chapterName,
                    time: publishDate,
                    langCode: "🇬🇧",
                })
            );
        });

        return chapters.reverse();
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = App.createRequest({
            url: `${DOMAIN}/manhwa/${mangaId}/chapter-${chapterId}/`,
            method: "GET",
        });

        const response = await this.requestManager.schedule(request, 1);
        const $ = cheerio.load(response.data as string);

        const pages: string[] = [];
        const scriptContent = $("script#single-chapter-js-extra").html();

        if (scriptContent) {
            const dataMatch = scriptContent.match(/var chapterData = (\{.*?\});/s);

            if (dataMatch && dataMatch[1]) {
                try {
                    const chapterData = JSON.parse(dataMatch[1]);
                    if (chapterData.data && chapterData.base) {
                        const decodedData = base64Decode(chapterData.data);
                        const imageArray = JSON.parse(decodedData);

                        imageArray.forEach((img: { src: string; w: number; h: number }, idx: number) => {
                            const fullUrl = `${chapterData.base}/${img.src}`;
                            pages.push(fullUrl);
                        });
                    }
                } catch (error) {}
            }
        }

        return App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages,
        });
    }
    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const request = App.createRequest({
            url: `${DOMAIN}/manhwa/${mangaId}/`,
            method: "GET",
        });

        const response = await this.requestManager.schedule(request, 1);
        const $ = cheerio.load(response.data as string);

        const title = $(".manga-titles h1").text().trim();
        const altTitles = $(".manga-titles h2").text().trim();

        const image =
            $("img")
                .filter((_, el) => $(el).attr("alt") === title)
                .first()
                .attr("src") ||
            $("div.flex.justify-center img").first().attr("src") ||
            "";

        const description = $(".manga-desc__content").text().trim();
        const author = $('a[href*="/author/"]').first().find("span").first().text().trim();
        const artist = $('a[href*="/artist/"]').first().find("span").first().text().trim();

        const metaDesc = $('meta[name="description"]').attr("content") || "";
        let status = "UNKNOWN";
        if (metaDesc.toLowerCase().includes("completed")) {
            status = "COMPLETED";
        } else if (metaDesc.toLowerCase().includes("ongoing")) {
            status = "ONGOING";
        }

        const ratingText = $(".manga-rating__value").text().trim();
        const rating = ratingText ? parseFloat(ratingText) : 0;

        const genres: string[] = [];
        $(".manga-genres a").each((_, element) => {
            const genre = $(element).text().trim();
            if (genre) {
                genres.push(genre);
            }
        });

        const tags: string[] = [];
        $('a[href*="/tag/"]').each((_, element) => {
            const tag = $(element).find("span.text-gray-100").text().trim();
            if (tag) {
                tags.push(tag);
            }
        });

        const tagSections: TagSection[] = [];

        if (genres.length > 0) {
            tagSections.push({
                id: "genres",
                label: "Genres",
                tags: genres.map((genre) => ({
                    id: genre.toLowerCase().replace(/[^a-z0-9]/g, ""),
                    label: genre,
                })),
            });
        }

        if (tags.length > 0) {
            tagSections.push({
                id: "tags",
                label: "Tags",
                tags: tags.map((tag) => ({
                    id: tag.toLowerCase().replace(/[^a-z0-9]/g, ""),
                    label: tag,
                })),
            });
        }

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles: [title, altTitles].filter((t) => t),
                image: image,
                desc: description,
                status: status,
                rating: rating,
                tags: tagSections,
                author: author,
                artist: artist,
                hentai: false,
            }),
        });
    }
    getMangaShareUrl(mangaId: string): string {
        return `${DOMAIN}/manhwa/${mangaId}`;
    }
}
