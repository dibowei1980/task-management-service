import numpy as np
import cv2
import matplotlib
# matplotlib.use('Agg') # 设置非交互式后端，防止plt.show()或窗口卡死
# 如果需要弹出窗口，使用默认后端或TkAgg/Qt5Agg
try:
    matplotlib.use('TkAgg')
except:
    pass # 如果失败则使用默认
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties

#配置Matplotlib支持中文显示
plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'SimSun', 'Arial']  # 优先使用中文字体
plt.rcParams['axes.unicode_minus'] = False  # 解决负号显示问题

from skimage import morphology
import os

class ShadowDetector:
    """
    高分辨率遥感影像阴影检测器
    基于脉冲耦合神经网络(PCNN)和最大熵分割方法
    """
    
    def __init__(self, ps=0.5, beta=0.1, v_theta=20, delta=0.1, iterations=50):
        """
        初始化阴影检测器
        
        参数:
        ps: 经验值，用于计算Ts (默认0.5)
        beta: PCNN调制参数 (默认0.1)
        v_theta: PCNN放大系数 (默认20)
        delta: PCNN阈值调整步长 (默认0.1)
        iterations: PCNN迭代次数 (默认50)
        """
        self.ps = ps
        self.beta = beta
        self.v_theta = v_theta
        self.delta = delta
        self.iterations = iterations
        
        # 创建连接矩阵（3x3邻域）
        self.w_matrix = np.array([[0.5, 1.0, 0.5],
                                  [1.0, 0.0, 1.0],
                                  [0.5, 1.0, 0.5]])
        self.m_matrix = np.array([[0.5, 1.0, 0.5],
                                  [1.0, 0.0, 1.0],
                                  [0.5, 1.0, 0.5]])
    
    def rgb_to_hsi(self, rgb_img):
        """
        将RGB图像转换到HSI颜色空间并提取I分量
        
        参数:
        rgb_img: 输入RGB图像，值范围0-255
        
        返回:
        i_component: I分量（亮度）
        """
        # 归一化到0-1范围
        rgb_norm = rgb_img.astype(np.float32) / 255.0
        
        # 提取R、G、B通道
        R = rgb_norm[:, :, 0]
        G = rgb_norm[:, :, 1]
        B = rgb_norm[:, :, 2]
        
        # 计算I分量（亮度）
        i_component = (R + G + B) / 3.0
        
        return i_component
    
    def compute_feature_r(self, rgb_img):
        """
        计算每个像素的特征值r
        
        参数:
        rgb_img: 输入RGB图像
        
        返回:
        r_values: 特征值r矩阵
        """
        # 提取R、G、B通道
        R = rgb_img[:, :, 0].astype(np.float32)
        G = rgb_img[:, :, 1].astype(np.float32)
        B = rgb_img[:, :, 2].astype(np.float32)
        
        # 计算I分量
        I = (R + G + B) / 3.0
        
        # 添加小值避免除零
        epsilon = 1e-10
        
        # 计算特征值r
        numerator = (2 * B + I) * (R + G + I)
        denominator = I + I + epsilon  # I + i, 其中i=I
        
        r_values = numerator / denominator
        
        return r_values
    
    def stretch_feature_values(self, r_values):
        """
        对特征值r进行拉伸，得到r'
        
        参数:
        r_values: 原始特征值矩阵
        
        返回:
        r_stretched: 拉伸后的特征值矩阵，值范围0-255
        """
        # 将r_values归一化到0-255
        r_min = np.min(r_values)
        r_max = np.max(r_values)
        if r_max > r_min:
            r_normalized = ((r_values - r_min) / (r_max - r_min) * 255).astype(np.uint8)
        else:
            r_normalized = np.zeros_like(r_values, dtype=np.uint8)
        
        # 计算直方图和概率分布
        hist, bins = np.histogram(r_normalized, bins=256, range=(0, 255))
        total_pixels = np.sum(hist)
        prob = hist.astype(np.float32) / total_pixels
        
        # 计算累积概率，找到Ts
        cum_prob = np.cumsum(prob)
        Ts_idx = np.argmax(cum_prob >= self.ps)
        Ts = bins[Ts_idx]
        
        # 计算σ
        if Ts_idx > 0:
            indices = np.arange(Ts_idx)
            weighted_diff = np.sum(prob[:Ts_idx] * (indices - Ts) ** 2)
            sigma = np.sqrt(weighted_diff) * self.ps
            if sigma == 0:
                sigma = 1.0
        else:
            sigma = 1.0
        
        # 应用拉伸函数
        r_stretched = np.zeros_like(r_normalized, dtype=np.float32)
        
        # 对小于Ts的值应用拉伸
        mask = r_normalized < Ts
        if np.any(mask):
            r_stretched[mask] = np.exp(-(r_normalized[mask] - Ts) ** 2 / (4 * sigma ** 2)) * 255
        
        # 其他值设为255
        r_stretched[~mask] = 255
        
        # 转换为uint8
        r_stretched = np.clip(r_stretched, 0, 255).astype(np.uint8)
        
        return r_stretched
    
    def calculate_entropy(self, binary_image):
        """
        计算二值图像的熵
        
        参数:
        binary_image: 二值图像（0和1）
        
        返回:
        entropy: 熵值
        """
        # 计算概率
        total_pixels = binary_image.size
        p1 = np.sum(binary_image) / total_pixels
        p0 = 1 - p1
        
        # 避免log2(0)
        if p1 == 0 or p0 == 0:
            return 0
        
        # 计算熵
        entropy = -p1 * np.log2(p1) - p0 * np.log2(p0)
        
        return entropy
    
    def pcnn_segmentation(self, stretched_image):
        """
        使用脉冲耦合神经网络(PCNN)进行图像分割
        
        参数:
        stretched_image: 拉伸后的特征图像，值范围0-255
        
        返回:
        best_binary: 最优分割结果（二值图像）
        best_entropy: 最大熵值
        """
        # 归一化外部输入
        S = stretched_image.astype(np.float32) / 255.0
        
        # 初始化PCNN变量
        height, width = S.shape
        F = np.zeros((height, width), dtype=np.float32)
        L = np.zeros((height, width), dtype=np.float32)
        U = np.zeros((height, width), dtype=np.float32)
        E = np.ones((height, width), dtype=np.float32)  # 初始阈值设为1
        Y = np.zeros((height, width), dtype=np.float32)
        
        # 记录最佳结果
        best_entropy = -np.inf
        best_binary = np.zeros((height, width), dtype=np.uint8)
        
        # 预先定义卷积核（确保是float32）
        kernel_m = self.m_matrix.astype(np.float32)
        kernel_w = self.w_matrix.astype(np.float32)
        
        # 迭代
        for n in range(self.iterations):
            # 使用cv2.filter2D加速卷积运算代替双重循环
            # F[i, j] = S[i, j] + np.sum(m_weights * y_neighbors)
            # L[i, j] = np.sum(w_weights * y_neighbors)
            
            # 计算卷积
            conv_m = cv2.filter2D(Y, -1, kernel_m, borderType=cv2.BORDER_CONSTANT)
            conv_w = cv2.filter2D(Y, -1, kernel_w, borderType=cv2.BORDER_CONSTANT)
            
            # 更新F通道
            F = S + conv_m
            
            # 更新L通道
            L = conv_w
            
            # 计算内部活动信号U
            U = F * (1 + self.beta * L)
            
            # 更新动态阈值E
            E = E - self.delta + self.v_theta * Y
            
            # 计算输出Y
            Y = np.where(U > E, 1.0, 0.0)
            
            # 计算当前二值图像的熵
            current_entropy = self.calculate_entropy(Y)
            
            # 更新最佳结果
            if current_entropy > best_entropy:
                best_entropy = current_entropy
                best_binary = Y.copy().astype(np.uint8)
        
        return best_binary, best_entropy
    
    def morphological_processing(self, binary_image):
        """
        对二值图像进行形态学处理
        
        参数:
        binary_image: 二值分割结果
        
        返回:
        processed_image: 形态学处理后的图像
        """
        # 转换为布尔类型
        binary_bool = binary_image.astype(bool)
        
        # 去除小物体（孤立点）
        cleaned = morphology.remove_small_objects(binary_bool, min_size=50)
        
        # 填充小空洞
        filled = morphology.remove_small_holes(cleaned, area_threshold=50)
        
        # 转换为uint8
        processed = filled.astype(np.uint8) * 255
        
        return processed
    
    def filter_shadow_by_side_length(self, shadow_mask, split_labels, centerlines):
        """
        计算桥梁中心线两侧的阴影总长度，保留长度大的一侧
        """
        if centerlines is None or len(centerlines) < 2:
            return shadow_mask, split_labels

        try:
            from scipy.spatial import cKDTree
        except ImportError:
            print("无法导入scipy.spatial.cKDTree，跳过两侧长度过滤")
            return shadow_mask, split_labels
            
        # 1. 准备中心线数据
        # 确保形状为 (N, 2)
        if centerlines.ndim == 3:
            centerlines = centerlines.reshape(-1, 2)
        elif centerlines.shape[1] != 2 and centerlines.shape[0] == 2:
             centerlines = centerlines.T
             
        # 计算每个中心线点的长度 (段长)
        diffs = np.linalg.norm(centerlines[1:] - centerlines[:-1], axis=1)
        # 补齐长度数组，seg_lens[i] 表示点 P[i] 到 P[i+1] 的长度
        seg_lens = np.zeros(len(centerlines))
        seg_lens[:-1] = diffs
        
        # 计算切向量 (简单差分)
        # T[i] = P[i+1] - P[i]
        # 最后一个点复用前一个切向
        tangents = np.zeros_like(centerlines, dtype=np.float32)
        tangents[:-1] = centerlines[1:] - centerlines[:-1]
        tangents[-1] = tangents[-2]
        
        # 构建KDTree
        tree = cKDTree(centerlines)
        
        # 2. 获取阴影像素点
        # 注意: split_labels > 0 的区域即为阴影
        # 我们使用 split_labels 来获取点，确保与组件一致
        y_idxs, x_idxs = np.nonzero(split_labels > 0)
        if len(y_idxs) == 0:
            return shadow_mask, split_labels
            
        shadow_points = np.column_stack((x_idxs, y_idxs)) # (N, 2) [x, y]
        
        # 3. 找到最近的中心线点
        # k=1 返回距离和索引
        _, nearest_indices = tree.query(shadow_points, k=1)
        
        # 4. 判断左右侧
        # V = Point - CenterlinePoint
        # Cross = Tx * Vy - Ty * Vx
        
        pts_nearest = centerlines[nearest_indices]
        vec_to_pt = shadow_points - pts_nearest
        tan_at_nearest = tangents[nearest_indices]
        
        cross_products = tan_at_nearest[:, 0] * vec_to_pt[:, 1] - tan_at_nearest[:, 1] * vec_to_pt[:, 0]
        
        # side_flags: True for Side A (>0), False for Side B (<=0)
        side_flags = cross_products > 0
        
        # 5. 计算每一侧的覆盖长度
        def get_occupied_length(indices):
            if len(indices) == 0:
                return 0.0
            center_idxs = nearest_indices[indices]
            unique_idxs = np.unique(center_idxs)
            
            mask = np.zeros(len(centerlines), dtype=bool)
            mask[unique_idxs] = True
            
            # 统计被覆盖的线段总长
            return np.sum(seg_lens[mask])
            
        idx_side_a = np.where(side_flags)[0]
        idx_side_b = np.where(~side_flags)[0]
        
        len_a = get_occupied_length(idx_side_a)
        len_b = get_occupied_length(idx_side_b)
        
        print(f"       中心线两侧阴影总长度对比: Side A = {len_a:.2f}, Side B = {len_b:.2f}")
        
        # 6. 决定保留哪一侧
        mask_to_remove = np.zeros_like(shadow_mask, dtype=bool)
        
        if len_a >= len_b:
            # 保留A，删除B
            if len(idx_side_b) > 0:
                rem_pts = shadow_points[idx_side_b]
                mask_to_remove[rem_pts[:, 1], rem_pts[:, 0]] = True
                print(f"       保留 Side A (大), 删除 Side B (小)")
        else:
            # 保留B，删除A
            if len(idx_side_a) > 0:
                rem_pts = shadow_points[idx_side_a]
                mask_to_remove[rem_pts[:, 1], rem_pts[:, 0]] = True
                print(f"       保留 Side B (大), 删除 Side A (小)")
                
        # 更新 mask 和 labels
        removed_part = np.zeros_like(shadow_mask)
        removed_part[mask_to_remove] = 255
        
        shadow_mask[mask_to_remove] = 0
        split_labels[mask_to_remove] = 0
        
        return shadow_mask, split_labels, removed_part

    def post_process_with_bridge_mask(self, shadow_mask, bridge_mask_path, json_path=None):
        """
        使用桥梁主体掩膜对阴影进行后处理：
        1. 滤除不与桥梁掩膜连接的阴影
        2. 支持传递性连接：如果阴影A与桥梁连接，阴影B与阴影A邻近（即使断开），阴影B也会被保留
        
        参数:
        shadow_mask: 阴影掩膜 (0 or 255)
        bridge_mask_path: 桥梁主体掩膜路径
        json_path: (可选) 桥梁中心线JSON文件路径
        
        返回:
        processed_mask: 处理后的阴影掩膜
        """
        if not os.path.exists(bridge_mask_path):
            print(f"警告: 未找到桥梁主体掩膜 {bridge_mask_path}，跳过后处理。")
            return shadow_mask, np.zeros_like(shadow_mask), None, None, None
            
        bridge_mask = cv2.imread(bridge_mask_path, cv2.IMREAD_GRAYSCALE)
        if bridge_mask is None:
            print(f"警告: 无法读取桥梁主体掩膜 {bridge_mask_path}，跳过后处理。")
            return shadow_mask, np.zeros_like(shadow_mask), None, None, None
            
        # 确保尺寸一致
        if bridge_mask.shape != shadow_mask.shape:
            bridge_mask = cv2.resize(bridge_mask, (shadow_mask.shape[1], shadow_mask.shape[0]), interpolation=cv2.INTER_NEAREST)
            
        # 用户指示：PCNN提取结果黑色(0)是阴影，白色(1)是背景
        # 但后续处理通常假设前景色(255)是目标，背景(0)是背景
        # 因此，如果检测到PCNN输出大部分是白色，或者根据用户指示，我们需要反转掩膜
        # 这里强制反转：将PCNN的黑色(0)变为白色(255)作为阴影前景
        shadow_mask = cv2.bitwise_not(shadow_mask)
        
        # 1. 标记直接连接的组件
        # 为了容错，先对桥梁掩膜进行轻微膨胀，确保接触
        kernel_connect = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        bridge_dilated = cv2.dilate(bridge_mask, kernel_connect, iterations=1)
        
        # 用户新策略：
        # 1. 对PCNN输出的阴影进行收缩2个像素，用于分割独立组件（切断微弱连接）
        #    使用4x4核腐蚀约等于收缩2-3像素
        kernel_erode = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (4, 4)) 
        shadow_eroded = cv2.erode(shadow_mask, kernel_erode, iterations=1)
        
        # 2. 核心逻辑优化：
        #    a. 使用收缩后的阴影作为种子
        #    b. 使用分水岭算法切断原始阴影中的微弱连接 (找回原始边界但保持切断状态)
        #    c. 判断切断后的独立组件是否与桥梁连接
        
        # 步骤A: 分析收缩后的连通性 (作为种子)
        num_labels_eroded, labels_eroded = cv2.connectedComponents(shadow_eroded, connectivity=8)
        
        if num_labels_eroded <= 1:
            print("所有阴影在收缩后均消失，判定为无效。")
            return np.zeros_like(shadow_mask), shadow_eroded, None, None, None

        # 步骤B: 分水岭分割 (Watershed)
        # 准备 markers: 
        #   0: 未知区域 (shadow_mask 内部 - shadow_eroded 内部)
        #   1..N: 阴影种子 (来自 shadow_eroded)
        #   N+1: 背景种子 (shadow_mask 外部)
        
        markers = labels_eroded.astype(np.int32)
        background_label = num_labels_eroded + 1
        markers[shadow_mask == 0] = background_label
        
        # 构造输入图像给 Watershed
        # 使用 shadow_mask 转 BGR，内部平坦，分水岭将按几何距离分割 (Voronoi)
        watershed_img = cv2.cvtColor(shadow_mask, cv2.COLOR_GRAY2BGR)
        
        # 执行分水岭
        # 结果中 -1 为边界线
        cv2.watershed(watershed_img, markers)
        
        # 步骤C: 连通性判断
        # 检查分割后的原始阴影组件 (markers 中的 1..num_labels_eroded-1) 是否与桥梁连接
        # 注意：这里使用扩展后的组件(markers)与桥梁进行判断，而非收缩后的种子
        
        # 找出与桥梁接触的 label ID
        overlap_mask = cv2.bitwise_and(shadow_mask, bridge_dilated)
        
        # 只关注 markers 中属于阴影组件的部分 (排除背景和边界)
        # 提取重叠区域的 marker 值
        connected_labels = np.unique(markers[overlap_mask > 0])
        
        # 过滤有效 label (排除 0, -1, background_label)
        valid_labels = []
        for label in connected_labels:
            if label > 0 and label < background_label:
                valid_labels.append(label)
        
        print(f"经分水岭分割出 {num_labels_eroded-1} 个独立组件，其中 {len(valid_labels)} 个与桥梁连接")
        
        if len(valid_labels) == 0:
            print("没有阴影块与桥梁连接。")
            return np.zeros_like(shadow_mask), shadow_eroded, None, None, None
            
        # 步骤D: 重建最终掩膜
        final_mask = np.isin(markers, valid_labels).astype(np.uint8) * 255
        
        # 步骤F: 基于中心线分割交叉阴影 (用户新要求)
        if json_path and os.path.exists(json_path):
            print("步骤F: 基于桥梁中心线分割交叉阴影...")
            _, centerlines, shadow_centerlines_img, split_labels = self.split_shadows_by_centerline(final_mask, json_path)
            
            # --- 新增过滤逻辑：滤除分割后与桥梁主体不连接的阴影 ---
            print("步骤G: 滤除分割后不连接的阴影...")
            
            # 找出与桥梁接触的 label ID
            # split_labels 中 0 是背景
            overlap_mask = cv2.bitwise_and((split_labels > 0).astype(np.uint8) * 255, bridge_dilated)
            
            # 提取重叠区域的 label 值
            connected_labels = np.unique(split_labels[overlap_mask > 0])
            
            # 重建掩膜和标签图
            new_final_mask = np.zeros_like(final_mask)
            new_split_labels = np.zeros_like(split_labels)
            
            # 记录被滤除的部分
            removed_shadow_mask = np.zeros_like(final_mask)
            
            valid_count = 0
            # 遍历所有存在的label
            all_labels = np.unique(split_labels)
            for label in all_labels:
                if label == 0: continue
                
                mask_i = (split_labels == label)
                
                if label in connected_labels:
                    # 保留
                    new_final_mask[mask_i] = 255
                    new_split_labels[mask_i] = label
                    valid_count += 1
                else:
                    # 滤除
                    removed_shadow_mask[mask_i] = 255
            
            print(f"       经中心线分割后共有 {np.max(split_labels)} 个组件，保留 {valid_count} 个与桥梁连接的组件。")
            
            final_mask = new_final_mask
            split_labels = new_split_labels
            
            # --- 新增过滤逻辑：计算两侧长度，保留大的一侧 ---
            print("步骤H: 计算两侧阴影长度并过滤...")
            final_mask, split_labels, removed_by_side = self.filter_shadow_by_side_length(final_mask, split_labels, centerlines)
            
            # 合并被滤除的部分
            removed_shadow_mask = cv2.bitwise_or(removed_shadow_mask, removed_by_side)
            
            # 步骤I: 最终阴影膨胀 (移至最后，仅膨胀保留的一侧)
            kernel_dilate_final = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
            final_mask = cv2.dilate(final_mask, kernel_dilate_final, iterations=1)
            
            # 用户要求“以不同颜色显示分割后的阴影”，这暗示我们需要保留 split_labels
            return final_mask, shadow_eroded, shadow_centerlines_img, split_labels, removed_shadow_mask
        
        # 步骤E (Fallback): 如果没有JSON，对整体进行膨胀
        kernel_dilate_final = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        final_mask = cv2.dilate(final_mask, kernel_dilate_final, iterations=1)
        
        # 如果没有JSON，返回空的中心线和标签
        return final_mask, shadow_eroded, None, None, None

    def parse_json_centerline(self, json_path, img_shape):
        """
        解析LabelMe格式或自定义格式的JSON，获取桥梁中心线点集
        并构建距离场
        """
        import json
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            points = None
            
            # 1. 尝试直接从 geometry.centerline 获取 (新发现的格式)
            if 'geometry' in data and 'centerline' in data['geometry']:
                 centerline_data = data['geometry']['centerline']
                 if 'coordinates' in centerline_data:
                     # 此时需要坐标转换
                     # 读取 bounds_geo 和 image size
                     if 'bounds_geo' in data['geometry'] and 'image_info' in data:
                         bounds = data['geometry']['bounds_geo'] # [min_x, min_y, max_x, max_y]
                         min_x, min_y, max_x, max_y = bounds
                         
                         width = data['image_info']['width']
                         height = data['image_info']['height']
                         
                         # 计算分辨率
                         res_x = (max_x - min_x) / width
                         res_y = (max_y - min_y) / height
                         
                         geo_points = centerline_data['coordinates']
                         pts_list = []
                         for gp in geo_points:
                             # Geo(x, y) -> Pixel(x, y)
                             # px = (gx - min_x) / res_x
                             # py = (max_y - gy) / res_y
                             px = int((gp[0] - min_x) / res_x)
                             py = int((max_y - gp[1]) / res_y)
                             pts_list.append([px, py])
                         points = np.array(pts_list, dtype=np.int32)
            
            # 2. 备选：尝试从 shapes 获取 (LabelMe 格式)
            if points is None and 'shapes' in data:
                for shape in data.get('shapes', []):
                    # 假设第一个shape就是
                    p = np.array(shape['points'], dtype=np.int32)
                    points = p
                    break # 只取第一个
            
            if points is None:
                print("JSON中未找到有效的中心线数据")
                return None, None
            
            # 构建距离场
            # 创建空白图
            h, w = img_shape[:2]
            line_mask = np.zeros((h, w), dtype=np.uint8)
            
            # 绘制中心线 (白色)
            # 注意 points 形状应该是 (N, 1, 2) 或 (N, 2)
            if len(points.shape) == 2:
                points = points.reshape((-1, 1, 2))
                
            cv2.polylines(line_mask, [points], isClosed=False, color=255, thickness=1)
            
            # 反转：背景白(255)，线黑(0)
            dist_src = np.ones((h, w), dtype=np.uint8) * 255
            cv2.polylines(dist_src, [points], isClosed=False, color=0, thickness=1)
            
            # 计算距离场
            dist_map = cv2.distanceTransform(dist_src, cv2.DIST_L2, 5)
            
            return points, dist_map
            
        except Exception as e:
            print(f"解析JSON失败: {e}")
            import traceback
            traceback.print_exc()
            return None, None

    def skeletonize_image(self, img):
        """
        提取二值图像的骨架
        """
        # 尝试使用 skimage
        try:
            from skimage.morphology import skeletonize
            # skeletonize 需要 bool 输入，返回 bool
            skel = skeletonize(img > 0)
            return (skel.astype(np.uint8) * 255)
        except ImportError:
            # OpenCV 形态学实现
            print("未找到 skimage，使用 OpenCV 形态学骨架化")
            skeleton = np.zeros(img.shape, np.uint8)
            eroded = img.copy()
            kernel = cv2.getStructuringElement(cv2.MORPH_CROSS, (3,3))
            
            while True:
                temp = cv2.erode(eroded, kernel)
                temp_dilated = cv2.dilate(temp, kernel)
                temp_sub = cv2.subtract(eroded, temp_dilated)
                skeleton = cv2.bitwise_or(skeleton, temp_sub)
                eroded = temp.copy()
                if cv2.countNonZero(eroded) == 0:
                    break
            return skeleton

    def split_shadows_by_centerline(self, shadow_mask, json_path):
        """
        核心逻辑：提取骨架 -> 检测交叉点 -> 基于桥梁中心线距离断开/重连 -> 分水岭分割
        """
        # 1. 解析JSON并获取距离场
        points, dist_map = self.parse_json_centerline(json_path, shadow_mask.shape)
        if dist_map is None:
            return shadow_mask, None, None, None
            
        # 2. 提取骨架
        skeleton = self.skeletonize_image(shadow_mask)
        
        # 3. 检测交叉点 (Junctions)
        # 卷积核计算邻域和
        kernel = np.array([[1, 1, 1],
                           [1, 10, 1],
                           [1, 1, 1]], dtype=np.uint8)
        
        # skeleton 是 0/255，先转 0/1
        skel_bool = (skeleton > 0).astype(np.uint8)
        neighbors = cv2.filter2D(skel_bool, -1, kernel)
        
        # 交叉点：中心是1(值>=10) 且 周围至少3个点(值>=13)
        # 注意：端点是11(1个邻居)，线段点是12(2个邻居)，分叉点是>=13
        junctions_mask = (neighbors >= 13).astype(np.uint8) * 255
        
        # 4. 断开交叉点，得到独立线段
        # 稍微膨胀交叉点以确保彻底断开
        kernel_dilate = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        junctions_dilated = cv2.dilate(junctions_mask, kernel_dilate, iterations=1)
        
        segments = cv2.bitwise_and(skeleton, cv2.bitwise_not(junctions_dilated))
        
        # 标记线段
        num_segments, segments_labels = cv2.connectedComponents(segments, connectivity=8)
        
        # 5. 分析交叉点并决定连接
        # 我们构建一个并查集来管理线段的合并
        parent = list(range(num_segments + 1))
        def find(i):
            if parent[i] == i: return i
            parent[i] = find(parent[i])
            return parent[i]
        def union(i, j):
            root_i = find(i)
            root_j = find(j)
            if root_i != root_j:
                parent[root_i] = root_j
                
        # 找出所有交叉点区域
        num_junc, junc_labels = cv2.connectedComponents(junctions_dilated, connectivity=8)
        
        # 对每个交叉区域进行分析
        for j_id in range(1, num_junc + 1):
            # 获取当前交叉点掩膜
            current_junc_mask = (junc_labels == j_id).astype(np.uint8) * 255
            
            # 找到与该交叉点连接的线段 ID
            # 膨胀一下交叉点去触碰线段
            dilated_junc = cv2.dilate(current_junc_mask, kernel_dilate, iterations=1)
            overlap = cv2.bitwise_and(segments, dilated_junc)
            
            # 获取连接的 segments labels
            connected_seg_ids = np.unique(segments_labels[overlap > 0])
            connected_seg_ids = connected_seg_ids[connected_seg_ids != 0]
            
            if len(connected_seg_ids) < 2:
                continue # 端点或孤立点，无需重连决策
                
            # 计算每个连接线段的“平均距离”得分
            seg_scores = []
            for seg_id in connected_seg_ids:
                # 获取该线段的所有坐标
                # 为了效率，只取靠近交叉点的一部分像素？或者取整体平均。
                # 取整体平均比较稳健
                mask_seg = (segments_labels == seg_id)
                mean_dist = np.mean(dist_map[mask_seg])
                seg_scores.append((seg_id, mean_dist))
            
            # 按距离从小到大排序
            seg_scores.sort(key=lambda x: x[1])
            
            # 取距离最小的两个进行连接（假设它们属于同一主干）
            # 阈值判断？如果距离差异太大可能不应连接？暂不加阈值，强制连通最佳两路
            best_id1 = seg_scores[0][0]
            best_id2 = seg_scores[1][0]
            
            # 合并
            union(best_id1, best_id2)
            
            # 如果有更多分支，它们将被断开（不进行 union）
            
        # 6. 生成最终的 Marker 图
        # 使用合并后的 ID
        final_markers = np.zeros_like(segments_labels, dtype=np.int32)
        
        # 映射 ID
        id_map = {}
        new_id_counter = 1
        
        for i in range(1, num_segments + 1):
            root = find(i)
            if root not in id_map:
                id_map[root] = new_id_counter
                new_id_counter += 1
            final_markers[segments_labels == i] = id_map[root]
            
        # 把交叉点区域也填回去？
        # 如果不填，分水岭会自动分配。最好不填，让分水岭决定边界。
        
        # 7. 分水岭分割
        # 背景设为 0，未知区域也是 0 (markers 中非0为种子)
        # OpenCV watershed 要求：种子为正整数，未知区域为0。背景也应该被标记。
        # 这里我们的 final_markers 只标记了骨架。
        # 我们需要把背景标记为一个特定的 ID。
        background_id = new_id_counter
        final_markers[shadow_mask == 0] = background_id
        
        watershed_img = cv2.cvtColor(shadow_mask, cv2.COLOR_GRAY2BGR)
        cv2.watershed(watershed_img, final_markers)
        
        # 8. 提取结果
        # final_markers 中，-1 是边界，background_id 是背景，其他是分割后的阴影 ID
        split_labels = final_markers.copy()
        split_labels[split_labels == -1] = 0 # 边界归0
        split_labels[split_labels == background_id] = 0 # 背景归0
        
        # 生成可视化的中心线 (仅显示骨架)
        # 为了好看，我们将合并后的骨架画出来
        merged_skeleton = np.zeros_like(shadow_mask)
        # 只保留 marker > 0 且 != background_id 的部分 (即原始骨架部分)
        # 注意 final_markers 经过 watershed 后已经填满了整个区域
        # 我们只想要线
        # 其实 skeleton 变量还在，但它是断开的。
        # 我们可以用 segments_labels 和 id_map 重绘
        
        vis_skeleton = np.zeros((shadow_mask.shape[0], shadow_mask.shape[1]), dtype=np.uint8)
        # 这里简单返回二值骨架用于叠加，或者返回带ID的骨架
        # 返回带ID的骨架以便显示不同颜色
        vis_skeleton_ids = np.zeros_like(segments_labels)
        for i in range(1, num_segments + 1):
             vis_skeleton_ids[segments_labels == i] = id_map[find(i)]
             
        # 还需要补回交叉点像素用于显示连通性吗？
        # 交叉点像素在 segments_labels 中是 0。
        # 我们可以简单地对 vis_skeleton_ids 进行形态学膨胀来填补空隙，或者直接画线。
        # 简单起见，返回 split_labels (区域) 和 vis_skeleton_ids (线)
        
        return shadow_mask, points, vis_skeleton_ids, split_labels

    def detect_shadows(self, rgb_image, bridge_mask_path=None, json_path=None):
        """
        主函数：检测RGB图像中的阴影区域
        
        参数:
        rgb_image: 输入RGB图像
        bridge_mask_path: (可选) 桥梁主体掩膜路径，用于后处理
        json_path: (可选) 桥梁中心线JSON文件路径
        
        返回:
        shadow_mask: 阴影区域掩码
        stretched_feature: 拉伸后的特征图
        binary_result: 二值分割结果 (PCNN原始输出)
        final_result: 叠加阴影区域的原始图像
        """
        # 步骤1: 计算特征值r
        print("步骤1: 计算特征值r...")
        r_values = self.compute_feature_r(rgb_image)
        
        # 步骤2: 拉伸特征值
        print("步骤2: 拉伸特征值...")
        stretched_feature = self.stretch_feature_values(r_values)
        
        # 步骤3: PCNN分割
        print("步骤3: PCNN分割...")
        binary_result, entropy = self.pcnn_segmentation(stretched_feature)
        print(f"最大熵值: {entropy:.4f}")
        
        # 保存PCNN原始输出用于可视化
        pcnn_raw_output = binary_result.copy()
        
        # 步骤4: 形态学处理 (用户指示：不进行形态学处理)
        # print("步骤4: 形态学处理...")
        # shadow_mask = self.morphological_processing(binary_result)
        shadow_mask = (binary_result * 255).astype(np.uint8)
        print("步骤4: 跳过形态学处理 (用户要求)")
        
        # 步骤4.5: 基于桥梁主体掩膜的后处理 (如果提供了掩膜)
        centerlines = None
        split_labels = None
        removed_shadow_mask = None
        
        if bridge_mask_path:
            print(f"步骤4.5: 基于桥梁主体掩膜的后处理 (Mask: {os.path.basename(bridge_mask_path)})...")
            if json_path:
                print(f"        关联JSON文件: {os.path.basename(json_path)}")
            shadow_mask, shadow_eroded, centerlines, split_labels, removed_shadow_mask = self.post_process_with_bridge_mask(shadow_mask, bridge_mask_path, json_path)
        else:
            shadow_eroded = np.zeros_like(shadow_mask) # 如果没有后处理，就没有收缩图
            
        # 步骤5: 生成最终结果图像（在原图上叠加阴影）
        print("步骤5: 叠加阴影区域...")
        final_result = rgb_image.copy()
        
        # 将阴影区域标记为红色
        # shadow_mask 是单通道，需要扩展为3通道
        # 创建红色遮罩
        red_mask = np.zeros_like(rgb_image)
        red_mask[:, :, 0] = 0   # B
        red_mask[:, :, 1] = 0   # G
        red_mask[:, :, 2] = 255 # R
        
        # 在阴影位置应用红色
        # 使用addWeighted进行半透明叠加
        alpha = 0.5
        mask_indices = shadow_mask == 255
        if np.any(mask_indices):
            final_result[mask_indices] = cv2.addWeighted(rgb_image[mask_indices], 1-alpha, red_mask[mask_indices], alpha, 0)
        
        return shadow_mask, stretched_feature, pcnn_raw_output*255, final_result, shadow_eroded, centerlines, split_labels, removed_shadow_mask
    
    def visualize_results(self, original, shadow_mask, stretched_feature, binary_result, final_result, shadow_eroded, bridge_mask_path=None, centerlines=None, split_labels=None, removed_shadow_mask=None, save_path=None):
        """
        可视化并保存中间过程和最终结果
        """
        fig = plt.figure(figsize=(18, 10))
        
        # 使用GridSpec自定义布局
        gs = plt.GridSpec(2, 4)
        
        # 1. 原始图像
        ax1 = plt.subplot(gs[0, 0])
        ax1.imshow(cv2.cvtColor(original, cv2.COLOR_BGR2RGB))
        ax1.set_title('1. 原始RGB图像')
        ax1.axis('off')
        
        # 2. 桥梁主体掩膜 (膨胀后)
        ax2 = plt.subplot(gs[0, 1])
        if bridge_mask_path and os.path.exists(bridge_mask_path):
            bridge_mask = cv2.imread(bridge_mask_path, cv2.IMREAD_GRAYSCALE)
            # 缩放到相同大小
            if bridge_mask.shape != shadow_mask.shape:
                bridge_mask = cv2.resize(bridge_mask, (shadow_mask.shape[1], shadow_mask.shape[0]), interpolation=cv2.INTER_NEAREST)
            
            # 显示膨胀后的掩膜，与处理逻辑一致
            kernel_connect = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            bridge_dilated = cv2.dilate(bridge_mask, kernel_connect, iterations=1)
            
            ax2.imshow(bridge_dilated, cmap='gray')
            ax2.set_title('2. 桥梁主体掩膜 (膨胀后)')
        else:
            ax2.text(0.5, 0.5, '无桥梁掩膜', ha='center', va='center')
            ax2.set_title('2. 桥梁主体掩膜')
        ax2.axis('off')
        
        # 3. PCNN分割前特征图
        ax3 = plt.subplot(gs[0, 2])
        ax3.imshow(stretched_feature, cmap='gray')
        ax3.set_title('3. PCNN输入特征图 (r值拉伸)')
        ax3.axis('off')
        
        # 4. 收缩后的阴影 (用于连通性分割)
        ax4 = plt.subplot(gs[0, 3])
        if split_labels is not None:
             # 如果有分割结果，显示彩色分割图
             num_labels = np.max(split_labels) + 1
             np.random.seed(123)
             colors = np.random.randint(0, 255, size=(num_labels, 3), dtype=np.uint8)
             colors[0] = [0, 0, 0] # 背景
             
             colored_split = colors[split_labels]
             
             # 叠加被滤除的部分 (黄色)
             if removed_shadow_mask is not None:
                 colored_split[removed_shadow_mask == 255] = [255, 255, 0]
                 
             ax4.imshow(colored_split)
             ax4.set_title(f'4. 分割结果 (彩色:保留, 黄:滤除)')
             
             # 叠加骨架
             if centerlines is not None:
                 # 骨架是非零的
                 skel_mask = centerlines > 0
                 
                 # 膨胀骨架以增强显示
                 kernel_vis = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
                 skel_mask_dilated = cv2.dilate(skel_mask.astype(np.uint8), kernel_vis, iterations=1) > 0
                 
                 # 将骨架画为白色或亮色
                 # 创建一个RGBA覆盖层
                 h, w = split_labels.shape
                 overlay = np.zeros((h, w, 4), dtype=np.float32)
                 overlay[skel_mask_dilated] = [1, 1, 1, 0.8] # 白色半透明
                 ax4.imshow(overlay)
                 
        else:
            ax4.imshow(shadow_eroded, cmap='gray')
            ax4.set_title('4. 收缩后的阴影 (用于分割)')
        ax4.axis('off')
        
        # 5. 直接连接的阴影 (最终保留)
        ax5 = plt.subplot(gs[1, 0])
        ax5.imshow(binary_result, cmap='gray')
        ax5.set_title('5. PCNN分割后 (形态学处理前)')
        ax5.axis('off')
        
        # 6. 最终结果叠加 (区分保留和滤除)
        # ax6 = plt.subplot(gs[1, 1:3]) # 占两列
        
        # 用户新要求:
        # 1. 单独显示被滤除的阴影 (背景黑色)
        # 2. 叠加到原影像的最终阴影以白色斑块显示
        
        # 拆分原来的大图为两个小图
        
        # 6.1 显示被滤除的阴影
        ax6 = plt.subplot(gs[1, 1])
        
        # 优先使用传入的 removed_shadow_mask
        if removed_shadow_mask is not None:
            removed_mask = removed_shadow_mask
        else:
            # 计算被滤除的阴影 (总阴影 - 保留阴影)
            if binary_result.dtype != np.uint8:
                binary_result_uint8 = binary_result.astype(np.uint8) * 255
            else:
                binary_result_uint8 = binary_result
            removed_mask = cv2.subtract(binary_result_uint8, shadow_mask)
            
        ax6.imshow(removed_mask, cmap='gray')
        ax6.set_title('6. 被滤除的阴影 (黑色背景)')
        ax6.axis('off')
        
        # 6.2 显示最终结果叠加 (白色斑块)
        ax7_vis = plt.subplot(gs[1, 2])
        
        overlay_vis = original.copy()
        
        # 准备显示掩膜：阴影 + 桥梁
        combined_mask = shadow_mask.copy()
        
        # 如果有桥梁掩膜，融合进来
        if bridge_mask_path and os.path.exists(bridge_mask_path):
            bridge_mask_vis = cv2.imread(bridge_mask_path, cv2.IMREAD_GRAYSCALE)
            if bridge_mask_vis is not None:
                # 缩放以匹配
                if bridge_mask_vis.shape != shadow_mask.shape:
                    bridge_mask_vis = cv2.resize(bridge_mask_vis, (shadow_mask.shape[1], shadow_mask.shape[0]), interpolation=cv2.INTER_NEAREST)
                
                # 融合 (Union)
                combined_mask = cv2.bitwise_or(combined_mask, bridge_mask_vis)
        
        # 绘制保留的阴影 (白色 [255, 255, 255])
        overlay_vis[combined_mask == 255] = [255, 255, 255]
        
        # 混合
        alpha = 1 # 完全不透明的白色覆盖？还是半透明？之前是alpha=1覆盖，然后addWeighted
        # 注意: 之前的逻辑是 final_vis = addWeighted(original, 0, overlay_vis, 1, 0) -> 这就全是 overlay_vis 了？
        # 不，之前的代码是:
        # alpha = 1
        # final_vis = cv2.addWeighted(original, 1-alpha, overlay_vis, alpha, 0)
        # 如果 alpha=1, 1-alpha=0, 结果就是 overlay_vis。
        # 而 overlay_vis 是 original.copy() 并在 mask 处涂白。
        # 所以结果是：背景是原图，mask处是纯白。
        
        # 如果想要半透明效果，应该把 alpha 设为 0.5 左右。
        # 但之前的代码 alpha=1 意味着用户可能想要实心白。
        # 但通常叠加显示是半透明的。
        # 让我们看看上一轮的代码：
        # alpha = 1
        # final_vis = cv2.addWeighted(original, 1-alpha, overlay_vis, alpha, 0)
        # 这确实是实心覆盖。
        
        # 不过为了“叠加显示”通常隐含“透视”或“覆盖”。
        # 我保持 alpha=1 (实心覆盖)，因为这是之前的逻辑。
        # 除非用户觉得太遮挡了。
        # 让我们把 alpha 改为 0.5 试试？或者保持 1。
        # 用户之前说“叠加到原影像的最终阴影以白色斑块显示”。斑块通常指实心区域。
        # 我将保持 alpha=1，但如果用户有异议可以改。
        
        final_vis = cv2.addWeighted(original, 1-alpha, overlay_vis, alpha, 0)
        
        ax7_vis.imshow(cv2.cvtColor(final_vis, cv2.COLOR_BGR2RGB))
        ax7_vis.set_title('7. 最终结果 (白色: 桥梁+阴影)')
        ax7_vis.axis('off')

        
        # 7. 细节说明 -> 移到控制台输出或图6标题
        # 我们使用 ax8 来显示 融合后膨胀1像素的结果
        ax8 = plt.subplot(gs[1, 3])
        
        # 计算融合后膨胀的掩膜
        kernel_final_dilate = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        combined_mask_dilated = cv2.dilate(combined_mask, kernel_final_dilate, iterations=1)
        
        overlay_dilated = original.copy()
        overlay_dilated[combined_mask_dilated == 255] = [255, 255, 255]
        
        final_vis_dilated = cv2.addWeighted(original, 1-alpha, overlay_dilated, alpha, 0)
        
        ax8.imshow(cv2.cvtColor(final_vis_dilated, cv2.COLOR_BGR2RGB))
        ax8.set_title('8. 融合结果膨胀1px')
        ax8.axis('off')
        
        # 统计信息显示在图下方
        shadow_pixels = np.count_nonzero(shadow_mask)
        removed_pixels = np.count_nonzero(removed_mask)
        total_pixels = shadow_mask.size
        
        ratio_kept = (shadow_pixels / total_pixels) * 100
        ratio_removed = (removed_pixels / total_pixels) * 100
        
        text_str = (f"检测统计: 保留(白): {shadow_pixels} px ({ratio_kept:.2f}%) | 滤除: {removed_pixels} px ({ratio_removed:.2f}%)")
        
        # 在整个图的底部显示文本
        plt.figtext(0.5, 0.02, text_str, fontsize=12, ha='center', bbox=dict(facecolor='white', alpha=0.8))
        
        plt.tight_layout(rect=[0, 0.05, 1, 1]) # 留出底部空间
        
        if save_path:
            plt.savefig(save_path, dpi=100)
            plt.close(fig)
            print(f"可视化结果已保存至: {save_path}")
        else:
            plt.show()
        # plt.close()


def main():
    """
    主函数：演示阴影检测流程
    """
    # 创建阴影检测器
    detector = ShadowDetector(
        ps=0.4,       # 经验值
        beta=0.25,    # 调制参数
        v_theta=25,   # 放大系数
        delta=0.15,   # 阈值调整步长
        iterations=30 # 迭代次数
    )
    
    # 测试图像路径（请替换为实际图像路径）
    image_path = r"D:\work\devlope\Bridge_Proc\genBridgeData\data\results\bridge_1\data\bridge_1_1.png"  # 替换为你的图像路径

    if not os.path.exists(image_path):
        print(f"图像文件不存在: {image_path}")
        print("请准备一个测试图像或使用内置示例")
        
        # 创建一个简单的测试图像（如果没有真实图像）
        height, width = 400, 600
        test_image = np.zeros((height, width, 3), dtype=np.uint8)
        
        # 创建一些区域作为模拟的阴影和非阴影
        # 非阴影区域（较亮）
        test_image[100:200, 100:300] = [180, 170, 160]
        test_image[250:350, 350:550] = [190, 185, 175]
        
        # 阴影区域（较暗）
        test_image[50:150, 400:550] = [60, 55, 50]
        test_image[300:380, 100:250] = [70, 65, 60]
        
        # 添加一些纹理
        noise = np.random.randint(-10, 10, (height, width, 3), dtype=np.int16)
        test_image = np.clip(test_image.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        
        print("使用生成的测试图像进行演示...")
    else:
        # 读取实际图像
        test_image = cv2.imread(image_path)
        if test_image is None:
            print(f"无法读取图像: {image_path}")
            return
        
        print(f"成功读取图像: {image_path}")
    
    # 调整图像大小（如果太大）
    # max_size = 800
    # height, width = test_image.shape[:2]
    # if max(height, width) > max_size:
    #     scale = max_size / max(height, width)
    #     new_width = int(width * scale)
    #     new_height = int(height * scale)
    #     test_image = cv2.resize(test_image, (new_width, new_height))
    #     print(f"图像已缩放至: {test_image.shape}")
    
    # 尝试寻找对应的桥梁主体掩膜和JSON文件
    # 假设图片名为 bridge_X_Y.png 
    # -> 掩膜名为 bridge_X_Y_mask_cut.png
    # -> JSON名为 bridge_X_Y.json
    bridge_mask_path = None
    json_path = None
    
    if os.path.exists(image_path):
        basename = os.path.basename(image_path)
        name_part = os.path.splitext(basename)[0]
        mask_name = f"{name_part}_mask_cut.png"
        json_name = f"{name_part}.json"
        
        img_dir = os.path.dirname(image_path)
        
        # 查找掩膜
        possible_mask_paths = [
            os.path.join(img_dir, mask_name),
            os.path.join(img_dir, "mask_withShadow", mask_name),
            os.path.join(os.path.dirname(img_dir), "mask_withShadow", mask_name),
            # 尝试根据已知结构硬编码路径
            os.path.join(r"D:\work\devlope\Bridge_Proc\genBridgeData\data\fw\bridge\output\mask\mask_withShadow", mask_name)
        ]
        
        for p in possible_mask_paths:
            if os.path.exists(p):
                bridge_mask_path = p
                print(f"找到桥梁主体掩膜: {bridge_mask_path}")
                break
                
        if not bridge_mask_path:
            print(f"未找到对应的桥梁主体掩膜 ({mask_name})，将跳过后处理步骤。")
            
        # 查找JSON
        possible_json_paths = [
            os.path.join(img_dir, json_name),
            os.path.join(os.path.dirname(img_dir), "original", json_name), # 假设可能在original下
             # 尝试根据已知结构硬编码路径
            os.path.join(r"D:\work\devlope\Bridge_Proc\genBridgeData\data\fw\bridge\output\mask\原始图像", json_name)
        ]
        
        for p in possible_json_paths:
            if os.path.exists(p):
                json_path = p
                print(f"找到桥梁JSON文件: {json_path}")
                break
    
    # 执行阴影检测
    print("开始阴影检测...")
    shadow_mask, stretched_feature, binary_result, final_result, shadow_eroded, centerlines, split_labels, removed_shadow_mask = detector.detect_shadows(test_image, bridge_mask_path, json_path)
    
    # 可视化结果
    detector.visualize_results(test_image, shadow_mask, stretched_feature, 
                              binary_result, final_result, shadow_eroded, bridge_mask_path, centerlines, split_labels, removed_shadow_mask)
    
    # 保存结果
    output_dir = r"D:\work\devlope\Bridge_Proc\genBridgeData\data\fw\bridge\output\mask\shadow_detection_results"
    os.makedirs(output_dir, exist_ok=True)
    
    cv2.imwrite(f"{output_dir}/shadow_mask.png", shadow_mask)
    cv2.imwrite(f"{output_dir}/stretched_feature.png", stretched_feature)
    cv2.imwrite(f"{output_dir}/binary_result.png", binary_result)
    cv2.imwrite(f"{output_dir}/final_result.png", final_result)
    
    print(f"结果已保存到目录: {output_dir}")
    
    # 显示检测到的阴影区域百分比
    shadow_pixels = np.sum(shadow_mask == 255)
    total_pixels = shadow_mask.size
    shadow_percentage = (shadow_pixels / total_pixels) * 100
    print(f"检测到的阴影区域占比: {shadow_percentage:.2f}%")


if __name__ == "__main__":
    main()