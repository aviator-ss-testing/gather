export interface GatherUrlSchemeParams {
  text?: string;
  collectionId?: string;
  title?: string;
  source?: string;
}

function parseQueryString(queryString: string): Record<string, string> {
  const params: Record<string, string> = {};

  if (!queryString) {
    return params;
  }

  const pairs = queryString.split("&");
  for (const pair of pairs) {
    const [key, value] = pair.split("=");
    if (key && value !== undefined) {
      params[key] = decodeURIComponent(value.replace(/\+/g, " "));
    }
  }

  return params;
}

export function parseGatherUrlScheme(url: string): GatherUrlSchemeParams | null {
  try {
    if (!url.startsWith("net.tiny-inter.gather://")) {
      return null;
    }

    const queryStringMatch = url.match(/\?(.+)$/);
    if (!queryStringMatch) {
      return {};
    }

    const queryParams = parseQueryString(queryStringMatch[1]);
    const params: GatherUrlSchemeParams = {};

    if (queryParams.text) {
      params.text = queryParams.text;
    }

    if (queryParams.collectionId) {
      params.collectionId = queryParams.collectionId;
    }

    if (queryParams.title) {
      params.title = queryParams.title;
    }

    if (queryParams.source) {
      params.source = queryParams.source;
    }

    return params;
  } catch (error) {
    return null;
  }
}
