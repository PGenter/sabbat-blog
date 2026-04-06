let nextDom = document.getElementById("next");
let prevDom = document.getElementById("prev");
let carouselDom = document.querySelector('.gallery-container');
let listItemDom = document.querySelector('.gallery-container .carousel-gallery');
let thumbnailDom = document.querySelector('.gallery-container .thumbnail-gallery');

nextDom!.onclick = () => {
    showSlider('next');
}
prevDom!.onclick = () => {
    showSlider('prev');
}

let timeRunning = 500;
let runTimeOut: NodeJS.Timeout;
function showSlider(type: string){
    let itemSlider = document.querySelectorAll('.gallery-container .carousel-gallery .item');
    let itemThumbnail = document.querySelectorAll('.gallery-container .thumbnail-gallery .item');

    if(type === 'next'){
        if (itemSlider.length > 0) {
            listItemDom?.appendChild(itemSlider[0]);
        }
        if (itemThumbnail.length >0) {
            thumbnailDom?.appendChild(itemThumbnail[0]);
        }
        carouselDom?.classList.add('next');
    }else{
        let positionLastItem = itemSlider.length - 1;
        listItemDom?.prepend(itemSlider[positionLastItem]);
        thumbnailDom?.prepend(itemThumbnail[positionLastItem]);
        carouselDom?.classList.add('prev');

    }

    clearTimeout(runTimeOut);
    runTimeOut = setTimeout(()=> {
        carouselDom?.classList.remove('next');
        carouselDom?.classList.remove('prev');
    },timeRunning)
}