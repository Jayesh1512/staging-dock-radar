import { POST as companyPostsCollectPost } from "../../linkedin/company-posts/collect/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return companyPostsCollectPost(request as any);
}
