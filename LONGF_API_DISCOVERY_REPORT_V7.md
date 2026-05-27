# LongF API discovery from HAR

Đã đọc HAR và trích xuất được các endpoint chính:

## Video Admin
- GET `/admin/video/index.do`
- POST `/admin/video/addResult.do`
- POST `/admin/video/editResult.do`
- GET `/admin/video/viewEdit.do?id={id}`
- GET `/admin/video/del.do?id={id}`
- GET `/admin/video/openClose.do?id={id}`
- GET `/admin/video/pinUnpin.do?id={id}`

## Upload video
- GET `https://img.longf.vn/v1/upload/upVideoFile.do`
- POST `https://img.longf.vn/v1/upload/addEditResult.do`

Response upload video trả về:
```json
{
  "code": 200,
  "msg": "success",
  "result": {
    "video_file_path": "https://img.longf.vn/upload/videos/...",
    "image_file_path": ""
  }
}
```

## Form fields
- `class_id`
- `title`
- `user_id`
- `publish_time`
- `file`
- `video_file`
- `is_open`
- `image_file`
- `base64_file`

Bản v7 đã thêm LongF API direct posting dựa trên các endpoint này.
