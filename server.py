from aiortc import MediaStreamTrack, VideoStreamTrack
from aiortc.contrib.media import MediaBlackhole, MediaPlayer, MediaRecorder
from aiohttp import web
import av
import cv2
import numpy as np
import asyncio
import time
import datetime
import os
from matplotlib import pyplot as plt
import cv2
import numpy as np
import tqdm
from mediapipe.python.solutions import drawing_utils as mp_drawing
from mediapipe.python.solutions import pose as mp_pose
import poseembedding as pe  # 姿态关键点编码模块
import poseclassifier as pc  # 姿态分类器
import resultsmooth as rs  # 分类结果平滑
import counter  # 动作计数器
import time

async def process(ws, frame_gen):
    class_name = 'squat_down'

    # Get some video parameters to generate output video with classificaiton.
    # video_n_frames = video_cap.get(cv2.CAP_PROP_FRAME_COUNT)
    # Initilize tracker, classifier and counter.
    # Do that before every video as all of them have state.

    # Folder with pose class CSVs. That should be the same folder you using while
    # building classifier to output CSVs.
    pose_samples_folder = 'pose'

    # Initialize tracker.
    pose_tracker = mp_pose.Pose()

    # Initialize embedder.
    pose_embedder = pe.FullBodyPoseEmbedder()

    # Initialize classifier.
    # Check that you are using the same parameters as during bootstrapping.
    pose_classifier = pc.PoseClassifier(
        pose_samples_folder=pose_samples_folder,
        class_name=class_name,
        pose_embedder=pose_embedder,
        top_n_by_max_distance=30,
        top_n_by_mean_distance=10)

    # # Uncomment to validate target poses used by classifier and find outliers.
    # outliers = pose_classifier.find_pose_sample_outliers()
    # print('Number of pose sample outliers (consider removing them): ', len(outliers))

    # Initialize EMA smoothing.
    pose_classification_filter = rs.EMADictSmoothing(
        window_size=10,
        alpha=0.2)

    # Initialize counter.
    repetition_counter = counter.RepetitionCounter(
        class_name=class_name,
        enter_threshold=5,
        exit_threshold=4)


    # Run classification on a video.

    # frame_idx = 0
    output_frame = None
    # with tqdm.tqdm(total=video_n_frames, position=0, leave=True) as pbar:
    async for input_frame in frame_gen:
        # Get next frame of the video.
        start_time = time.time()

        input_frame = cv2.cvtColor(input_frame, cv2.COLOR_BGR2RGB)
        result = pose_tracker.process(image=input_frame)
        pose_landmarks = result.pose_landmarks

        # Draw pose prediction.
        output_frame = input_frame.copy()
        if pose_landmarks is not None:
            mp_drawing.draw_landmarks(
                image=output_frame,
                landmark_list=pose_landmarks,
                connections=mp_pose.POSE_CONNECTIONS)

        if pose_landmarks is not None:
            # Get landmarks.
            frame_height, frame_width = output_frame.shape[0], output_frame.shape[1]
            pose_landmarks = np.array([[lmk.x * frame_width, lmk.y * frame_height, lmk.z * frame_width]
                                       for lmk in pose_landmarks.landmark], dtype=np.float32)
            assert pose_landmarks.shape == (33, 3), 'Unexpected landmarks shape: {}'.format(pose_landmarks.shape)

            # Classify the pose on the current frame.
            pose_classification = pose_classifier(pose_landmarks)

            # Smooth classification using EMA.
            pose_classification_filtered = pose_classification_filter(pose_classification)

            # Count repetitions.
            repetitions_count = repetition_counter(pose_classification_filtered)
            await ws.send_str(str(repetitions_count))
        else:
            # No pose => no classification on current frame.
            pose_classification = None

            # Still add empty classification to the filter to maintaing correct
            # smoothing for future frames.
            pose_classification_filtered = pose_classification_filter(dict())
            pose_classification_filtered = None

            # Don't update the counter presuming that person is 'frozen'. Just
            # take the latest repetitions count.
            repetitions_count = repetition_counter.n_repeats
            await ws.send_str(str(repetitions_count))
            end_time = time.time()  # End time
            print(f"Processed one frame in {end_time - start_time} seconds")

    # Close output video.
    pose_tracker.close()


async def frame_generator(video_track):
    while True:
        # 获取视频帧
        frame = await video_track.recv()

        # 将帧转换为 NumPy 数组
        frame = frame.to_ndarray(format="bgr24")

        yield frame


async def websocket_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    print("已连接")

    # 创建一个设备对象，这里我们使用默认设备
    player = MediaPlayer('default:none', format='avfoundation',options = {'framerate': '30', 'video_size': '640x480'})
    # 创建一个媒体接收器，这里我们将视频流保存到文件
    recorder = MediaRecorder("file.mp4")

    # 获取视频流
    video_track = player.video

    # 将视频流添加到媒体接收器
    recorder.addTrack(video_track)

    # 开始接收视频流
    await recorder.start()

    while True:
        msg = await ws.receive_str()
        if msg == 'start_counter':
            await ws.send_str('start_receiving')
            await asyncio.sleep(2)
            break

    # 创建帧生成器
    frame_gen = frame_generator(video_track)

    # 调用 process 函数
    await process(ws, frame_gen)

    await recorder.stop()

    print("已断开")
    return ws


app = web.Application()
app.router.add_route('GET', '/path', websocket_handler)
web.run_app(app, host='localhost', port=8080)
