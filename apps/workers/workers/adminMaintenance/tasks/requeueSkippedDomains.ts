import { and, asc, eq, gt, inArray } from "drizzle-orm";

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
const PROGRESS_LOG_INTERVAL = 100;

export async function runRequeueSkippedDomainsTask(
  job: DequeuedJob<ZAdminMaintenanceRequeueSkippedDomainsTask>,
) {
  const jobId = job.id;
  logger.info(
    `[adminMaintenance:requeue_skipped_domains][${jobId}] Starting re-queue of skipped bookmarks`,
  );

  let requeuedCount = 0;
  let processedCount = 0;
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

    if (job.abortSignal.aborted) {
      logger.warn(
        `[adminMaintenance:requeue_skipped_domains][${jobId}] Aborted`,
      );
      break;
    }

    // Filter bookmarks whose domains are no longer in the skip list
    const bookmarksToRequeue = skippedBookmarks.filter(
      (bookmark) => !shouldSkipDomain(bookmark.url),
    );

    if (bookmarksToRequeue.length > 0) {
      const idsToUpdate = bookmarksToRequeue.map((b) => b.id);

      // Batch update all statuses in a single query
      await db
        .update(bookmarkLinks)
        .set({ crawlStatus: "pending" })
        .where(inArray(bookmarkLinks.id, idsToUpdate));

      // Enqueue all bookmarks for crawling
      for (const bookmark of bookmarksToRequeue) {
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
      }

      requeuedCount += bookmarksToRequeue.length;
    }

    processedCount += skippedBookmarks.length;
    cursor = skippedBookmarks[skippedBookmarks.length - 1]?.id;

    // Log progress periodically
    if (processedCount % PROGRESS_LOG_INTERVAL === 0) {
      logger.info(
        `[adminMaintenance:requeue_skipped_domains][${jobId}] Progress: processed ${processedCount} bookmarks, re-queued ${requeuedCount}`,
      );
    }
  }

  logger.info(
    `[adminMaintenance:requeue_skipped_domains][${jobId}] Completed. Processed ${processedCount} bookmarks, re-queued ${requeuedCount}`,
  );
}
