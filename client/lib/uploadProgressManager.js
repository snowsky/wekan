import { ReactiveVar } from 'meteor/reactive-var';

class UploadProgressManager {
  constructor() {
    this.cardUploads = new ReactiveVar(new Map());
    this.uploadMap = new ReactiveVar(new Map());
  }

  addUpload(cardId, uploader, file) {
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const upload = {
      id: uploadId,
      cardId,
      file,
      uploader,
      progress: new ReactiveVar(0),
      status: new ReactiveVar('uploading'),
      error: new ReactiveVar(null),
      startTime: Date.now(),
      endTime: null,
    };

    const currentCardUploads = this.cardUploads.get();
    const cardUploads = currentCardUploads.get(cardId) || [];
    cardUploads.push(upload);
    currentCardUploads.set(cardId, cardUploads);
    this.cardUploads.set(currentCardUploads);

    const currentUploadMap = this.uploadMap.get();
    currentUploadMap.set(uploadId, upload);
    this.uploadMap.set(currentUploadMap);

    uploader.on('progress', progress => {
      upload.progress.set(progress);
    });

    uploader.on('uploaded', error => {
      upload.status.set(error ? 'error' : 'completed');
      upload.endTime = Date.now();
      upload.error.set(error);

      setTimeout(() => {
        this.removeUpload(uploadId);
      }, 2000);
    });

    uploader.on('error', error => {
      upload.status.set('error');
      upload.endTime = Date.now();
      upload.error.set(error);

      setTimeout(() => {
        this.removeUpload(uploadId);
      }, 3000);
    });

    return uploadId;
  }

  removeUpload(uploadId) {
    const upload = this.uploadMap.get().get(uploadId);
    if (!upload) return;

    const { cardId } = upload;
    const currentCardUploads = this.cardUploads.get();
    const cardUploads = currentCardUploads.get(cardId) || [];
    const filteredCardUploads = cardUploads.filter(u => u.id !== uploadId);

    if (filteredCardUploads.length === 0) {
      currentCardUploads.delete(cardId);
    } else {
      currentCardUploads.set(cardId, filteredCardUploads);
    }
    this.cardUploads.set(currentCardUploads);

    const currentUploadMap = this.uploadMap.get();
    currentUploadMap.delete(uploadId);
    this.uploadMap.set(currentUploadMap);
  }

  getUploadsForCard(cardId) {
    return this.cardUploads.get().get(cardId) || [];
  }

  getUploadCountForCard(cardId) {
    return this.getUploadsForCard(cardId).length;
  }

  hasActiveUploads(cardId) {
    return this.getUploadCountForCard(cardId) > 0;
  }

  getAllUploads() {
    const allUploads = [];
    this.cardUploads.get().forEach(cardUploads => {
      allUploads.push(...cardUploads);
    });
    return allUploads;
  }

  clearAllUploads() {
    this.cardUploads.set(new Map());
    this.uploadMap.set(new Map());
  }
}

const uploadProgressManager = new UploadProgressManager();

export default uploadProgressManager;
