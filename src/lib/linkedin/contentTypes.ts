export interface LinkedInContentPost {
  postUrl: string | null;
  postContent: string;
  authorName: string | null;
  /**
   * Raw published text from LinkedIn, typically a relative time such as:
   * "1h", "2d", "3w", "1m", "1y" or a formatted date string.
   */
  publishedAt: string | null;
}

