import { ReactiveCache } from '/imports/reactiveCache';
import { Meteor } from 'meteor/meteor';
import { MongoInternals } from 'meteor/mongo';

/**
 * Backward compatibility layer for CollectionFS to Meteor-Files migration.
 * Handles reading attachments from old CollectionFS database structure.
 */

const OldAttachmentsFiles = new Mongo.Collection('cfs_gridfs.attachments.files');
const OldAttachmentsFileRecord = new Mongo.Collection('cfs.attachments.filerecord');

export function isNewAttachmentStructure(attachmentId) {
  if (Meteor.isServer) {
    return !!ReactiveCache.getAttachment(attachmentId);
  }
  return false;
}

export function getOldAttachmentData(attachmentId) {
  if (Meteor.isServer) {
    try {
      const fileRecord = OldAttachmentsFileRecord.findOne({ _id: attachmentId });
      if (!fileRecord) {
        return null;
      }

      const fileData = OldAttachmentsFiles.findOne({ _id: attachmentId });
      if (!fileData) {
        return null;
      }

      return {
        _id: attachmentId,
        name: fileRecord.original?.name || fileData.filename || 'Unknown',
        size: fileRecord.original?.size || fileData.length || 0,
        type: fileRecord.original?.type || fileData.contentType || 'application/octet-stream',
        extension: getFileExtension(fileRecord.original?.name || fileData.filename || ''),
        extensionWithDot: getFileExtensionWithDot(fileRecord.original?.name || fileData.filename || ''),
        meta: {
          boardId: fileRecord.boardId,
          swimlaneId: fileRecord.swimlaneId,
          listId: fileRecord.listId,
          cardId: fileRecord.cardId,
          userId: fileRecord.userId,
          source: 'legacy',
        },
        uploadedAt: fileRecord.uploadedAt || fileData.uploadDate || new Date(),
        updatedAt: fileRecord.original?.updatedAt || fileData.uploadDate || new Date(),
        isImage: isImageFile(fileRecord.original?.type || fileData.contentType),
        isVideo: isVideoFile(fileRecord.original?.type || fileData.contentType),
        isAudio: isAudioFile(fileRecord.original?.type || fileData.contentType),
        isText: isTextFile(fileRecord.original?.type || fileData.contentType),
        isJSON: isJSONFile(fileRecord.original?.type || fileData.contentType),
        isPDF: isPDFFile(fileRecord.original?.type || fileData.contentType),
        link() {
          return `/cfs/files/attachments/${this._id}`;
        },
        versions: {
          original: {
            path: `/cfs/files/attachments/${attachmentId}`,
            size: fileRecord.original?.size || fileData.length || 0,
            type: fileRecord.original?.type || fileData.contentType || 'application/octet-stream',
            storage: 'gridfs',
          },
        },
      };
    } catch (error) {
      console.error('Error reading old attachment data:', error);
      return null;
    }
  }
  return null;
}

function getFileExtension(filename) {
  if (!filename) return '';
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.substring(lastDot + 1).toLowerCase();
}

function getFileExtensionWithDot(filename) {
  const ext = getFileExtension(filename);
  return ext ? `.${ext}` : '';
}

function isImageFile(mimeType) {
  return mimeType && mimeType.startsWith('image/');
}

function isVideoFile(mimeType) {
  return mimeType && mimeType.startsWith('video/');
}

function isAudioFile(mimeType) {
  return mimeType && mimeType.startsWith('audio/');
}

function isTextFile(mimeType) {
  return mimeType && mimeType.startsWith('text/');
}

function isJSONFile(mimeType) {
  return mimeType === 'application/json';
}

function isPDFFile(mimeType) {
  return mimeType === 'application/pdf';
}

export function getAttachmentWithBackwardCompatibility(attachmentId) {
  if (isNewAttachmentStructure(attachmentId)) {
    return ReactiveCache.getAttachment(attachmentId);
  }

  return getOldAttachmentData(attachmentId);
}

export function getAttachmentsWithBackwardCompatibility(query) {
  const newAttachments = ReactiveCache.getAttachments(query);
  const oldAttachments = [];

  if (Meteor.isServer) {
    try {
      const cardId = query['meta.cardId'];
      if (cardId) {
        const oldFileRecords = OldAttachmentsFileRecord.find({ cardId }).fetch();
        for (const fileRecord of oldFileRecords) {
          const oldAttachment = getOldAttachmentData(fileRecord._id);
          if (oldAttachment) {
            oldAttachments.push(oldAttachment);
          }
        }
      }
    } catch (error) {
      console.error('Error reading old attachments:', error);
    }
  }

  const allAttachments = [...newAttachments, ...oldAttachments];
  return allAttachments.filter((attachment, index, self) =>
    index === self.findIndex(a => a._id === attachment._id)
  );
}

export function getOldAttachmentStream(attachmentId) {
  if (Meteor.isServer) {
    try {
      const db = MongoInternals.defaultRemoteCollectionDriver().mongo.db;
      const bucket = new MongoInternals.NpmModule.GridFSBucket(db, {
        bucketName: 'cfs_gridfs.attachments',
      });

      return bucket.openDownloadStreamByName(attachmentId);
    } catch (error) {
      console.error('Error creating GridFS stream:', error);
      return null;
    }
  }
  return null;
}

export function getOldAttachmentDataBuffer(attachmentId) {
  if (Meteor.isServer) {
    try {
      const db = MongoInternals.defaultRemoteCollectionDriver().mongo.db;
      const bucket = new MongoInternals.NpmModule.GridFSBucket(db, {
        bucketName: 'cfs_gridfs.attachments',
      });

      return new Promise((resolve, reject) => {
        const chunks = [];
        const downloadStream = bucket.openDownloadStreamByName(attachmentId);

        downloadStream.on('data', chunk => {
          chunks.push(chunk);
        });

        downloadStream.on('end', () => {
          resolve(Buffer.concat(chunks));
        });

        downloadStream.on('error', error => {
          reject(error);
        });
      });
    } catch (error) {
      console.error('Error reading GridFS data:', error);
      return null;
    }
  }
  return null;
}
