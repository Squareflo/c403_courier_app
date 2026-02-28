import { supabase } from '../lib/supabase';

export interface CloudinaryImageUploadResponse {
  secure_url: string;
  public_id: string;
}

export const uploadImageToCloudinary = async (
  imageUri: string
): Promise<CloudinaryImageUploadResponse> => {
  try {
    const formData = new FormData();
    formData.append('file', {
      uri: imageUri,
      type: 'image/jpeg',
      name: `chat_image_${Date.now()}.jpg`,
    } as any);
    formData.append('folder', 'chat-images');

    const { data, error } = await supabase.functions.invoke('cloudinary-upload-image', {
      body: formData,
    });

    if (error) {
      console.error('Edge function error:', error);
      throw new Error('Failed to upload image');
    }

    return data;
  } catch (error) {
    console.error('Error uploading image to Cloudinary:', error);
    throw new Error('Failed to upload image to Cloudinary');
  }
};
