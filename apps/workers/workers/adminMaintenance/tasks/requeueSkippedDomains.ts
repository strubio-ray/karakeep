import { and, asc, eq, gt } from "drizzle-orm";

import { db } from "@karakeep/db";
import { bookmarkLinks, bookmarks } from "@karakeep/db/schema";
import {
  LinkCrawlerQueue,
  ZAdminMaintenanceRequeueSkippedDomainsTask,
} from "@karakeep/shared-server";
import logger from "@karakeep/shared/logger";
import { DequeuedJob } from "@karakeep/shared/queueing";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { shouldSkipDomain } from "../../../network";

const BATCH_SIZE = 100;

export async function runRequeueSkippedDomainsTask(
  job: DequeuedJob<ZAdminMaintenanceRequeueSkippedDomainsTask>,
) {
  const jobId = job.id;
  logger.info(
    `[adminMaintenance:requeue_skipped_domains][${jobId}] Starting re-queue of skipped bookmarks`,
  );

  let requeuedCount = 0;
  let cursor: string | undefined;

  while (!job.abortSignal.aborted) {
    // Query batch of skipped bookmarks using cursor-based pagination
    // This avoids issues with offset-based pagination when modifying records
    const skippedBookmarks = await db
      .select({
        id: bookmarkLinks.id,
        url: bookmarkLinks.url,
        userId: bookmarks.userId,
      })
      .from(bookmarkLinks)
      .innerJoin(bookmarks, eq(bookmarkLinks.id, bookmarks.id))
      .where(
        cursor
          ? and(
              gt(bookmarkLinks.id, cursor),
              eq(bookmarkLinks.crawlStatus, "skipped"),
              eq(bookmarks.type, BookmarkTypes.LINK),
            )
          : and(
              eq(bookmarkLinks.crawlStatus, "skipped"),
              eq(bookmarks.type, BookmarkTypes.LINK),
            ),
      )
      .orderBy(asc(bookmarkLinks.id))
      .limit(BATCH_SIZE);

    if (skippedBookmarks.length === 0) {
      break;
    }

    for (const bookmark of skippedBookmarks) {
      if (job.abortSignal.aborted) {
        logger.warn(
          `[adminMaintenance:requeue_skipped_domains][${jobId}] Aborted`,
        );
        break;
      }

      // Check if domain is still in skip list
      if (!shouldSkipDomain(bookmark.url)) {
        logger.info(
          `[adminMaintenance:requeue_skipped_domains][${jobId}] Re-queuing bookmark ${bookmark.id} (URL: ${bookmark.url}) - domain no longer in skip list`,
        );

        // Update status to pending
        await db
          .update(bookmarkLinks)
          .set({ crawlStatus: "pending" })
          .where(eq(bookmarkLinks.id, bookmark.id));

        // Enqueue for crawling with idempotency key to prevent duplicates
        await LinkCrawlerQueue.enqueue(
          {
            bookmarkId: bookmark.id,
            runInference: true,
          },
          {
            idempotencyKey: `requeue_skipped:${bookmark.id}`,
            groupId: bookmark.userId,
          },
        );

        requeuedCount++;
      }
    }

    cursor = skippedBookmarks[skippedBookmarks.length - 1]?.id;
  }

  logger.info(
    `[adminMaintenance:requeue_skipped_domains][${jobId}] Completed. Re-queued ${requeuedCount} bookmarks`,
  );
}
