export const en = {
  tabs: {
    svg: "SVG Image Export",
    audio: "WAV Audio Convert (MP3)",
  },
  main: {
    compatAlert: "This browser does not support the File System Access API. Fallback file upload is used.",
    noSvgInFolder: "No SVG files found in the selected folder.",
    noWavInFolder: "No WAV files found in the selected folder.",
    folderScanDone: (count: number) => `Folder scan complete: Detected ${count} files.`,
    folderPermissionFail: (msg: string) => `Failed to acquire folder permission: ${msg}`,
    outputFolderSet: (name: string) => `Output folder specified: ${name}`,
    noFallbackSvg: "No SVG files found in the uploaded folders or files.",
    noFallbackWav: "No WAV files found in the uploaded folders or files.",
    fallbackUploadDone: (count: number) => `Manual upload complete: Prepared ${count} files.`,
    noSvgToConvert: "No SVG files to convert. Please select a folder or upload files first.",
    noWavToConvert: "No WAV files to convert. Please select a folder or upload files first.",
    noSelectedSvg: "No SVG files selected. Please select at least one file to convert.",
    noSelectedWav: "No WAV files selected. Please select at least one file to convert.",
    invalidScale: "The selected scale option is invalid.",
    startConversion: (format: string, scale: number) => `Starting conversion process... [Format: ${format.toUpperCase()}, Scale: ${scale}x]`,
    startAudioConversion: (bitrate: number) => `Starting audio conversion... [Output: MP3, Quality: ${bitrate}kbps]`,
    localOutputDirReady: (name: string) => `Local output folder is ready: ${name}`,
    directWriteNotice: "No output folder specified. Saving converted files directly in the original paths.",
    permissionFailFallback: "Failed to acquire local folder permission. Falling back to ZIP archive download due to browser restrictions.",
    zipArchiveStart: "Starting virtual ZIP archive build.",
    convertSuccess: (relPath: string, outName: string, w: number, h: number) => `Success: ${relPath} → ${outName} (${w}x${h} px)`,
    convertAudioSuccess: (relPath: string, outName: string) => `Success: ${relPath} → ${outName}`,
    originalDeleted: (relPath: string) => `Original file deleted: ${relPath}`,
    originalDeleteFail: (relPath: string, msg: string) => `Failed to delete original file: ${relPath} (${msg})`,
    convertFail: (relPath: string, msg: string) => `Failed: ${relPath} - ${msg}`,
    parseError: (relPath: string, msg: string) => `Structure parsing error: ${relPath} - ${msg}`,
    zipCompressing: "Compressing ZIP archive...",
    zipDownloadDone: (name: string) => `ZIP archive download complete: ${name}.zip`,
    zipDownloadFail: (msg: string) => `Failed to build ZIP download archive: ${msg}`,
    conversionEnded: (success: number, fail: number) => `Conversion finished. (Success: ${success}, Failed: ${fail})`,
    alertSuccessText: (isLocal: boolean, hasOutput: boolean, outName: string) => {
      let dest = "";
      if (isLocal) {
        dest = hasOutput
          ? `Individual images were saved directly into the specified output folder '${outName}'.`
          : `Individual converted image files were saved directly in the same directories as the original SVG files.`;
      } else {
        dest = `Due to browser restrictions (Safari/Firefox, etc.), images were provided as a ZIP download maintaining virtual folder structure.`;
      }
      return `Conversion completed successfully!\n\n${dest}`;
    },
    alertAudioSuccessText: (isLocal: boolean, hasOutput: boolean, outName: string) => {
      let dest = "";
      if (isLocal) {
        dest = hasOutput
          ? `Individual MP3 files were saved directly into the specified output folder '${outName}'.`
          : `Individual converted MP3 files were saved directly in the same directories as the original WAV files.`;
      } else {
        dest = `Due to browser restrictions (Safari/Firefox, etc.), converted audio files were provided as a ZIP download maintaining virtual folder structure.`;
      }
      return `Conversion completed successfully!\n\n${dest}`;
    },
    alertSuccessTitle: "Conversion Completed!",
    alertFail: "Conversion completed, but no resources were converted. Please check the log console.",
    queueRemoved: (name: string) => `Removed from queue: ${name}`,
    compatBannerText: (name: string) => `Your current browser does not fully support the latest APIs to write files directly to local directories or manage original files. Instead, converted files will be compiled and downloaded securely in a single ZIP package named ${name}.zip.`,
    compatBannerTitle: "Browser Compatibility Notice:",
    converting: "Converting...",
    completed: "Conversion complete!",
    progress: "Progress:",
    doneCount: "Completed:",
    waitingFiles: "Queue:",
    exportFormat: "Format:",
    applyScale: "Scale:",
    applyBitrate: "Quality:",
    suffix: "Suffix:",
    btnConvert: "Start Conversion",
    btnConverting: "Converting...",
    baseScale: "1.0x (Default)",
  },
  settings: {
    linkFolder: "Link Target SVG Folder",
    localFolderSelect: "Specify Local Directory",
    folderAutoFetch: "Automatically scan and load all SVG files in the directory.",
    filesLoaded: (count: number) => `${count} files loaded`,
    noFolderSelected: "No local directory selected.",
    fallbackUpload: "Select & Upload Workspace Folder",
    fallbackUploadDesc: "Upload and import directory contents.",
    filesDetected: (count: number) => `${count} files detected`,
    waitingImport: "Waiting for folder import...",
    rulesHeader: "Export Settings",
    imgFormat: "Output Image Format",
    scaleSetting: "Output Image Scale (Select One)",
    placeholderSuffix: "No Suffix",
    suffixTooltip: "Suffix appended to filename when scale is applied",
    outputDirLabel: "Export Target Folder (Output Path)",
    resetDir: "Clear",
    selectOutputDir: "Specify Output Folder",
    noOutputDirCompat: "Due to browser security restrictions, individual output folder selection is not supported. You will receive all converted images in a single ZIP file upon completion.",
    outputDirDesc: "If the output folder is not specified, files will be saved in the same directory as their original SVGs.",
    deleteOriginalLabel: "Auto-delete original SVG after conversion",
    deleteOriginalDesc: "Removes original SVG (.svg) files from the target directory after conversion completes successfully.",
    deleteOriginalAlert: "Original files can only be controlled when a local directory is successfully linked to the browser.",
  },
  audioSettings: {
    linkFolder: "Link Target Audio Folder",
    localFolderSelect: "Specify Local Directory",
    folderAutoFetch: "Automatically scan and load all WAV files in the directory.",
    filesLoaded: (count: number) => `${count} audio files loaded`,
    noFolderSelected: "No local directory selected.",
    fallbackUpload: "Select & Upload Workspace Folder",
    fallbackUploadDesc: "Upload and import directory contents.",
    filesDetected: (count: number) => `${count} audio files detected`,
    waitingImport: "Waiting for folder import...",
    rulesHeader: "MP3 Conversion Settings",
    bitrateLabel: "MP3 Output Bitrate (Quality)",
    bitrateDesc: "Higher bitrate increases audio quality but results in larger file sizes.",
    outputDirLabel: "Export Target Folder (Output Path)",
    resetDir: "Clear",
    selectOutputDir: "Specify Output Folder",
    noOutputDirCompat: "Due to browser security restrictions, individual output folder selection is not supported. You will receive all converted files in a single ZIP file upon completion.",
    outputDirDesc: "If the output folder is not specified, files will be saved in the same directory as their original WAVs.",
    deleteOriginalLabel: "Auto-delete original WAV after conversion",
    deleteOriginalDesc: "Removes original WAV (.wav) files from the target directory after conversion completes successfully.",
    deleteOriginalAlert: "Original files can only be controlled when a local directory is successfully linked to the browser.",
  },
  queue: {
    selectAll: "Select / Deselect All",
    fileList: (count: number) => `File List (${count} files)`,
    emptyQueue: "The queue is empty. Please link a local folder.",
    statusPending: "Pending",
    statusProcessing: "Converting",
    statusSuccess: "Success",
    statusError: "Error",
    deleteTooltip: "Remove from queue (Del key)",
  }
};


