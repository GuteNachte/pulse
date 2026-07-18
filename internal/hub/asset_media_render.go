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
type assetMediaRecipe struct {
	Crop                      assetMediaCrop
	Placement                 *assetMediaPlacement
	OutputWidth, OutputHeight int
}

// renderAssetMediaVersion converts a normalized editor recipe into a durable JPEG.
func renderAssetMediaVersion(source []byte, recipe assetMediaRecipe) ([]byte, error) {
	decoded, _, err := image.Decode(bytes.NewReader(source))
	if err != nil {
		return nil, err
	}
	if recipe.Placement != nil {
		return renderAssetMediaPlacement(decoded, *recipe.Placement, recipe.OutputWidth, recipe.OutputHeight)
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

	canvas := image.NewRGBA(image.Rect(0, 0, outputWidth, outputHeight))
	draw.Draw(canvas, canvas.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)
	width := max(1, int(math.Round(float64(outputWidth)*placement.Width)))
	height := max(1, int(math.Round(float64(outputHeight)*placement.Height)))
	resized := imaging.Resize(source, width, height, imaging.Lanczos)
	x := int(math.Round(float64(outputWidth) * placement.X))
	y := int(math.Round(float64(outputHeight) * placement.Y))
	draw.Draw(canvas, image.Rect(x, y, x+width, y+height), resized, resized.Bounds().Min, draw.Over)

	var output bytes.Buffer
	if err := jpeg.Encode(&output, canvas, &jpeg.Options{Quality: 92}); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}
