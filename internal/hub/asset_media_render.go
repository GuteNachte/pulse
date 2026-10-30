package hub

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"math"

	"github.com/disintegration/imaging"
)

type assetMediaCrop struct{ X, Y, Width, Height float64 }
type assetMediaPlacement struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

// assetMediaAdjustments 2026-10-10 图片编辑专项：亮度/对比度调节（-100~100，0 = 不调节）。
type assetMediaAdjustments struct {
	Brightness int `json:"brightness"`
	Contrast   int `json:"contrast"`
}

type assetMediaRecipe struct {
	Crop                      assetMediaCrop
	Placement                 *assetMediaPlacement
	OutputWidth, OutputHeight int
	// 2026-10-10 图片编辑专项：调节参数随 recipe 持久化，修复重渲染时也能复现。
	Adjustments assetMediaAdjustments
}

func clampAssetMediaAdjustment(value int) int {
	return min(100, max(-100, value))
}

// applyAssetMediaAdjustments 按 -100~100 的整数参数做亮度/对比度调节（imaging 以百分比为单位）；
// 超界参数先 clamp，0 值跳过。
func applyAssetMediaAdjustments(source image.Image, adjustments assetMediaAdjustments) image.Image {
	result := source
	brightness := clampAssetMediaAdjustment(adjustments.Brightness)
	if brightness != 0 {
		result = imaging.AdjustBrightness(result, float64(brightness))
	}
	contrast := clampAssetMediaAdjustment(adjustments.Contrast)
	if contrast != 0 {
		result = imaging.AdjustContrast(result, float64(contrast))
	}
	return result
}

// renderAssetMediaVersion converts a normalized editor recipe into a durable JPEG.
func renderAssetMediaVersion(source []byte, recipe assetMediaRecipe) ([]byte, error) {
	decoded, _, err := image.Decode(bytes.NewReader(source))
	if err != nil {
		return nil, err
	}
	if recipe.Placement != nil {
		return renderAssetMediaPlacement(decoded, *recipe.Placement, recipe.OutputWidth, recipe.OutputHeight, recipe.Adjustments)
	}

	// Legacy crop recipes remain readable so existing edited images can still be rebuilt.
	b := decoded.Bounds()
	crop := recipe.Crop
	if crop.Width <= 0 || crop.Width > 1 {
		crop.Width = 1
	}
	if crop.Height <= 0 || crop.Height > 1 {
		crop.Height = 1
	}
	if crop.X < 0 {
		crop.X = 0
	}
	if crop.Y < 0 {
		crop.Y = 0
	}
	if crop.X+crop.Width > 1 {
		crop.X = 1 - crop.Width
	}
	if crop.Y+crop.Height > 1 {
		crop.Y = 1 - crop.Height
	}
	x, y := int(float64(b.Dx())*crop.X), int(float64(b.Dy())*crop.Y)
	w, h := int(float64(b.Dx())*crop.Width), int(float64(b.Dy())*crop.Height)
	result := imaging.Crop(decoded, image.Rect(b.Min.X+x, b.Min.Y+y, b.Min.X+x+w, b.Min.Y+y+h))
	if recipe.OutputWidth > 0 && recipe.OutputHeight > 0 {
		result = imaging.Fill(result, recipe.OutputWidth, recipe.OutputHeight, imaging.Center, imaging.Lanczos)
	}
	var output bytes.Buffer
	err = jpeg.Encode(&output, result, &jpeg.Options{Quality: 92})
	return output.Bytes(), err
}

func renderAssetMediaPlacement(
	source image.Image,
	placement assetMediaPlacement,
	outputWidth int,
	outputHeight int,
	adjustments assetMediaAdjustments,
) ([]byte, error) {
	if outputWidth <= 0 || outputHeight <= 0 {
		return nil, fmt.Errorf("输出画布尺寸无效")
	}
	for _, value := range []float64{placement.X, placement.Y, placement.Width, placement.Height} {
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return nil, fmt.Errorf("图片位置参数无效")
		}
	}
	if placement.Width <= 0 || placement.Height <= 0 || placement.Width > 16 || placement.Height > 16 {
		return nil, fmt.Errorf("图片缩放范围无效")
	}
	if math.Abs(placement.X) > 16 || math.Abs(placement.Y) > 16 {
		return nil, fmt.Errorf("图片位置超出允许范围")
	}

	// 2026-10-10 图片编辑专项：画布底色改黑色——与预览一致（黑底 letterbox），
	// 未覆盖区域显示黑色，用户能清楚看到图片完整边界与裁剪范围。
	canvas := image.NewRGBA(image.Rect(0, 0, outputWidth, outputHeight))
	draw.Draw(canvas, canvas.Bounds(), &image.Uniform{C: color.Black}, image.Point{}, draw.Src)
	width := max(1, int(math.Round(float64(outputWidth)*placement.Width)))
	height := max(1, int(math.Round(float64(outputHeight)*placement.Height)))
	resized := imaging.Resize(source, width, height, imaging.Lanczos)
	// 2026-10-10 图片编辑专项：调节在白底合成前施加，与编辑器预览一致（只影响照片本身）
	adjusted := applyAssetMediaAdjustments(resized, adjustments)
	x := int(math.Round(float64(outputWidth) * placement.X))
	y := int(math.Round(float64(outputHeight) * placement.Y))
	draw.Draw(canvas, image.Rect(x, y, x+width, y+height), adjusted, adjusted.Bounds().Min, draw.Over)

	var output bytes.Buffer
	if err := jpeg.Encode(&output, canvas, &jpeg.Options{Quality: 92}); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}
